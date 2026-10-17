import { ExecutionContext } from "./execution-context";
import { resolveProvider } from "../providers/resolve-provider";

/**
 * Re-resolve the runtime-only provider data (credentials, headers, CLI
 * executable) after the current provider has been changed.
 *
 * The configuration keeps only credential references; this function is the
 * single way the runtime view is refreshed so consumers never have to read
 * plaintext secrets out of the configuration.
 */
export async function refreshResolvedProvider(
  executionContext: ExecutionContext,
): Promise<void> {
  executionContext.resolvedProvider = await resolveProvider(
    executionContext.provider,
    { env: executionContext.process.env },
  );
}
