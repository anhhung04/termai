import { spawn } from "child_process";
import { ErrorCode, TerminalAIError } from "../lib/errors";

export type CliAdapterRequest = {
  /** Absolute path to the executable, from detection (never re-resolved). */
  executable: string;
  /** Fixed argument vector; no shell interpretation is applied. */
  args: string[];
  /** Text written to the child's stdin, then stdin is closed. */
  input: string;
  /** Hard timeout. The child is killed when it elapses. */
  timeoutMs: number;
  /** Cancellation signal (e.g. Ctrl+C handling). */
  signal?: AbortSignal;
  /** Maximum captured stdout bytes; overflow is an error. */
  maxOutputBytes?: number;
  /** Environment passed to the child (already allowlisted by the caller). */
  env: NodeJS.ProcessEnv;
  cwd?: string;
};

export type CliAdapterResult = {
  stdout: string;
  exitCode: number;
};

const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

/**
 * Run a CLI-backed provider request.
 *
 * Guarantees:
 * - argv-based spawn, never a shell;
 * - bounded stdout, timeout and cancellation escalation;
 * - non-zero exit, spawn failure, timeout and abort map to typed errors whose
 *   messages never include argv, environment, stdout or stderr contents.
 */
export function runCliAdapter(
  request: CliAdapterRequest,
): Promise<CliAdapterResult> {
  const maxOutputBytes = request.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES;
  const label = request.executable;

  return new Promise<CliAdapterResult>((resolve, reject) => {
    let settled = false;
    let stdoutBytes = 0;
    const chunks: Buffer[] = [];

    const child = spawn(request.executable, request.args, {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: request.env,
      cwd: request.cwd,
    });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (request.signal) request.signal.removeEventListener("abort", onAbort);
      fn();
    };

    const killChild = () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        //  Escalate if the child ignores SIGTERM.
        const escalation = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
          }
        }, 2000);
        escalation.unref();
      }
    };

    const timer = setTimeout(() => {
      killChild();
      finish(() =>
        reject(
          new TerminalAIError(
            ErrorCode.InvalidOperation,
            `CLI provider '${label}' timed out after ${request.timeoutMs}ms`,
          ),
        ),
      );
    }, request.timeoutMs);

    const onAbort = () => {
      killChild();
      finish(() =>
        reject(
          new TerminalAIError(
            ErrorCode.InvalidOperation,
            `CLI provider '${label}' was cancelled`,
          ),
        ),
      );
    };
    if (request.signal) {
      if (request.signal.aborted) {
        onAbort();
        return;
      }
      request.signal.addEventListener("abort", onAbort, { once: true });
    }

    child.on("error", (err: NodeJS.ErrnoException) => {
      finish(() =>
        reject(
          new TerminalAIError(
            ErrorCode.InvalidOperation,
            `CLI provider '${label}' could not be started${
              err && typeof err.code === "string" && !/[\s]/.test(err.code)
                ? ` (${err.code})`
                : ""
            }`,
          ),
        ),
      );
    });

    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutputBytes) {
        killChild();
        finish(() =>
          reject(
            new TerminalAIError(
              ErrorCode.InvalidOperation,
              `CLI provider '${label}' produced more than ${maxOutputBytes} bytes of output`,
            ),
          ),
        );
        return;
      }
      chunks.push(chunk);
    });

    //  stderr is intentionally consumed but never surfaced or retained: it may
    //  contain prompts echoing credential material.
    child.stderr.on("data", () => {
      /* discard */
    });

    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      const stdout = Buffer.concat(chunks).toString("utf8");
      finish(() => {
        if (signal) {
          reject(
            new TerminalAIError(
              ErrorCode.InvalidOperation,
              `CLI provider '${label}' was terminated by signal ${signal}`,
            ),
          );
          return;
        }
        if (code !== 0) {
          reject(
            new TerminalAIError(
              ErrorCode.InvalidOperation,
              `CLI provider '${label}' exited with code ${code}`,
            ),
          );
          return;
        }
        resolve({ stdout, exitCode: code ?? 0 });
      });
    });

    //  Write the prompt, then close stdin so CLIs reading until EOF proceed.
    child.stdin.on("error", () => {
      /* EPIPE when the child exits before reading; handled by 'close' */
    });
    child.stdin.end(request.input);
  });
}
