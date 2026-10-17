import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import { ErrorCode, TerminalAIError } from "../lib/errors";

const DEFAULT_COMMAND_TIMEOUT_MS = 5000;
const MAX_COMMAND_OUTPUT_BYTES = 4096;

/**
 * A reference to a secret which is resolved at runtime and never persisted.
 *
 * - `{ env: "OPENAI_API_KEY" }` reads an environment variable.
 * - `{ command: "op", args: ["read", "op://vault/key"] }` runs an external
 *   credential tool with a fixed argv (never a shell string).
 * - `{ provider: "keychain", name: "openai" }` delegates to a registered
 *   in-process credential provider lookup.
 */
export type CredentialReference =
  | { env: string }
  | { command: string; args?: string[]; timeoutMs?: number }
  | { provider: string; name: string };

export type CredentialProviderLookup = (
  provider: string,
  name: string,
) => string | undefined | Promise<string | undefined>;

//  Environment variables which credential commands are allowed to inherit.
//  Everything else (API keys, tokens, cloud credentials) is withheld so a
//  compromised or buggy lookup tool cannot exfiltrate unrelated secrets.
const COMMAND_ENV_ALLOWLIST: Record<string, true> = {
  PATH: true,
  HOME: true,
  USER: true,
  LOGNAME: true,
  SHELL: true,
  TMPDIR: true,
  LANG: true,
  LC_ALL: true,
  TZ: true,
  SystemRoot: true,
  USERPROFILE: true,
  APPDATA: true,
  LOCALAPPDATA: true,
  COMSPEC: true,
  PATHEXT: true,
};

export function credentialCommandEnvironment(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(env)) {
    if (COMMAND_ENV_ALLOWLIST[key] === true) result[key] = env[key];
  }
  //  Ensure the lookup tool can be resolved on platforms where it was not
  //  explicit in the inherited environment.
  if (result.PATH === undefined) {
    result.PATH = process.env["PATH"] || "/usr/bin:/bin";
  } else {
    result.PATH = process.env["PATH"] || result.PATH;
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: string[],
): boolean {
  return Object.keys(value).every((key) => allowed.indexOf(key) !== -1);
}

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
//  Reject control characters; a credential argument must be a single token,
//  never something that could smuggle a second command or newline.
const UNSAFE_ARG_PATTERN = /[\0\r\n]/;

export function isCredentialReference(
  value: unknown,
): value is CredentialReference {
  if (!isPlainObject(value)) return false;

  if (typeof value["env"] === "string") {
    return hasOnlyKeys(value, ["env"]);
  }

  if (typeof value["command"] === "string") {
    const args = value["args"];
    const timeoutMs = value["timeoutMs"];
    return (
      hasOnlyKeys(value, ["command", "args", "timeoutMs"]) &&
      (args === undefined ||
        (Array.isArray(args) && args.every((a) => typeof a === "string"))) &&
      (timeoutMs === undefined ||
        (typeof timeoutMs === "number" && Number.isFinite(timeoutMs)))
    );
  }

  if (
    typeof value["provider"] === "string" &&
    typeof value["name"] === "string"
  ) {
    return hasOnlyKeys(value, ["provider", "name"]);
  }

  return false;
}

export function validateCredentialReference(
  reference: unknown,
  fieldName: string,
): asserts reference is CredentialReference {
  if (!isCredentialReference(reference)) {
    throw new TerminalAIError(
      ErrorCode.InvalidConfiguration,
      `${fieldName} must be a credential reference: { env }, { command, args? }, or { provider, name }`,
    );
  }

  if ("env" in reference && !ENV_NAME_PATTERN.test(reference.env)) {
    throw new TerminalAIError(
      ErrorCode.InvalidConfiguration,
      `${fieldName}.env must be a valid environment variable name`,
    );
  }

  if ("command" in reference) {
    if (!reference.command.trim()) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `${fieldName}.command must not be empty`,
      );
    }
    if (UNSAFE_ARG_PATTERN.test(reference.command)) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `${fieldName}.command must not contain control characters`,
      );
    }
    const args = reference.args || [];
    if (args.some((arg) => UNSAFE_ARG_PATTERN.test(arg))) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `${fieldName}.args must not contain control characters`,
      );
    }
    if (
      reference.timeoutMs !== undefined &&
      (reference.timeoutMs < 1 || reference.timeoutMs > 120000)
    ) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `${fieldName}.timeoutMs must be between 1 and 120000 milliseconds`,
      );
    }
  }

  if (
    "provider" in reference &&
    (!reference.provider.trim() || !reference.name.trim())
  ) {
    throw new TerminalAIError(
      ErrorCode.InvalidConfiguration,
      `${fieldName}.provider and ${fieldName}.name must not be empty`,
    );
  }
}

export async function resolveCredentialReference(
  reference: CredentialReference,
  env: NodeJS.ProcessEnv = process.env,
  providerLookup?: CredentialProviderLookup,
): Promise<string> {
  validateCredentialReference(reference, "credential reference");

  if ("env" in reference) {
    const value = env[reference.env];
    if (!value) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `credential environment variable '${reference.env}' is not set`,
      );
    }
    return value;
  }

  if ("command" in reference) {
    let stdout: string;
    try {
      //  argv-based execution only: no shell, fixed argument vector.
      const result = await execFileAsync(
        reference.command,
        reference.args || [],
        {
          shell: false,
          timeout: reference.timeoutMs || DEFAULT_COMMAND_TIMEOUT_MS,
          maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
          windowsHide: true,
          cwd: os.homedir(),
          env: credentialCommandEnvironment(env),
        },
      );
      stdout = result.stdout;
    } catch (err) {
      //  Never retain or surface the child error: it may embed stdout/stderr
      //  which themselves may be secret material.
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `credential command '${path.basename(reference.command)}' failed${credentialFailureSuffix(
          err,
        )} - check the command configuration`,
      );
    }

    //  Trim exactly one trailing newline; reject empty, multi-line (a leaked
    //  blob rather than a credential) and oversized output.
    if (stdout.length > MAX_COMMAND_OUTPUT_BYTES) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        "credential command output exceeded the maximum size",
      );
    }
    const value = stdout.replace(/\r?\n$/, "");
    if (!value.trim()) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        "credential command returned an empty value",
      );
    }
    if (/[\r\n]/.test(value)) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        "credential command returned multiple lines - expected a single value",
      );
    }
    return value;
  }

  if (!providerLookup) {
    throw new TerminalAIError(
      ErrorCode.InvalidConfiguration,
      `credential provider '${reference.provider}' is not available`,
    );
  }
  const value = await providerLookup(reference.provider, reference.name);
  if (!value) {
    throw new TerminalAIError(
      ErrorCode.InvalidConfiguration,
      `credential provider '${reference.provider}' returned no value for '${reference.name}'`,
    );
  }
  return value;
}

export async function resolveCredential(
  value: string | CredentialReference,
): Promise<string> {
  if (typeof value === "string") return value;
  return resolveCredentialReference(value);
}

const SENSITIVE_KEY =
  /(api.?key|secret|password|token|authorization|credential)/i;

export function redactSecrets(value: unknown, key?: string): unknown {
  if (SENSITIVE_KEY.test(key || "")) {
    return isCredentialReference(value) ? value : "[REDACTED]";
  }
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const entryKey of Object.keys(value)) {
      result[entryKey] = redactSecrets(value[entryKey], entryKey);
    }
    return result;
  }
  return value;
}

/**
 * Strip any plaintext secret field before it can be written back to YAML.
 * Credential references are preserved; plaintext values are dropped.
 */
export function sanitizeConfigurationForPersistence<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeConfigurationForPersistence(item),
    ) as unknown as T;
  }
  if (!isPlainObject(value)) return value;

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const entry = value[key];
    if (SENSITIVE_KEY.test(key)) {
      if (isCredentialReference(entry)) result[key] = entry;
      continue;
    }
    result[key] = sanitizeConfigurationForPersistence(entry);
  }
  return result as unknown as T;
}

/**
 * True when a configuration object still contains a non-empty plaintext
 * secret string which should be migrated to a credential reference.
 */
export function containsPlaintextCredential(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPlaintextCredential);
  if (!isPlainObject(value)) return false;
  for (const key of Object.keys(value)) {
    const entry = value[key];
    if (SENSITIVE_KEY.test(key)) {
      if (typeof entry === "string" && entry.length > 0) return true;
    } else if (containsPlaintextCredential(entry)) {
      return true;
    }
  }
  return false;
}

const execFileAsync = promisify(execFile);

//  Extract only a non-secret exit code from a failed lookup, never the error
//  object itself (which can carry stdout/stderr/argv).
function credentialFailureSuffix(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = err.code;
    if (typeof code === "number") return ` with exit code ${code}`;
    if (typeof code === "string" && !/[\s]/.test(code)) return ` (${code})`;
  }
  return "";
}
