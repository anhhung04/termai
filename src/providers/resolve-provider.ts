import { ProviderConfiguration } from "../configuration/configuration";
import {
  CredentialProviderLookup,
  CredentialReference,
  isCredentialReference,
  resolveCredentialReference,
  validateCredentialReference,
} from "../configuration/credentials";
import { ErrorCode, TerminalAIError } from "../lib/errors";
import { findExecutable, getKnownCliTool } from "./cli-detection";

export const DEFAULT_CLI_TIMEOUT_MS = 120000;

export type ResolvedProvider = {
  provider: ProviderConfiguration;
  /** Resolved API key or undefined for CLI providers. */
  apiKey?: string;
  /** Resolved, non-secret header values. */
  headers: Record<string, string>;
  /** Resolved CLI executable path, for `type: cli`. */
  cliExecutable?: string;
};

export type ResolveProviderOptions = {
  env?: NodeJS.ProcessEnv;
  providerLookup?: CredentialProviderLookup;
  platform?: NodeJS.Platform;
};

/**
 * Resolve all runtime-only provider data: credential references, header
 * values and CLI executable paths. The returned values are never persisted.
 */
export async function resolveProvider(
  provider: ProviderConfiguration,
  options: ResolveProviderOptions = {},
): Promise<ResolvedProvider> {
  const env = options.env || process.env;

  const headers: Record<string, string> = {};
  for (const headerName of Object.keys(provider.headers || {})) {
    const headerValue = (provider.headers || {})[headerName];
    headers[headerName] = isCredentialReference(headerValue)
      ? await resolveCredentialReference(
          headerValue,
          env,
          options.providerLookup,
        )
      : headerValue;
  }

  if (provider.type === "cli") {
    const tool = provider.cli?.tool;
    if (!tool) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `provider '${provider.name}' is a CLI provider but has no cli.tool`,
      );
    }
    const known = getKnownCliTool(tool);
    if (!known) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `provider '${provider.name}' references unknown CLI '${tool}'`,
      );
    }
    const executable = findExecutable(tool, env, options.platform);
    if (executable === undefined) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `CLI '${tool}' was not found on PATH - install it or run 'ai init' to choose another provider`,
      );
    }
    return { provider, headers, cliExecutable: executable };
  }

  const apiKey = await resolveApiKey(provider, env, options.providerLookup);
  return { provider, apiKey, headers };
}

async function resolveApiKey(
  provider: ProviderConfiguration,
  env: NodeJS.ProcessEnv,
  providerLookup?: CredentialProviderLookup,
): Promise<string | undefined> {
  if (provider.apiKey === "") return undefined;
  if (typeof provider.apiKey === "string") return provider.apiKey;
  if (!isCredentialReference(provider.apiKey)) {
    throw new TerminalAIError(
      ErrorCode.InvalidConfiguration,
      `provider '${provider.name}'.apiKey must be a string or credential reference`,
    );
  }
  validateCredentialReference(
    provider.apiKey as CredentialReference,
    `${provider.name}.apiKey`,
  );
  return resolveCredentialReference(provider.apiKey, env, providerLookup);
}

export function providerRequiresApiKey(
  provider: ProviderConfiguration,
): boolean {
  return provider.type !== "cli";
}
