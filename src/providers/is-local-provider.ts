import { ProviderConfiguration } from "../configuration/configuration";

/**
 * Returns true when the provider's baseURL resolves to a local or private
 * network address (localhost, loopback, RFC-1918 ranges, or .local mDNS).
 *
 * Used to omit internet-dependent tools (search_web, fetch_page) when the
 * CLI is running on a machine that connects to a local LLM but has no
 * outbound internet access.
 */
export function isLocalProvider(provider: ProviderConfiguration): boolean {
  const { baseURL } = provider;
  if (!baseURL) return false;

  let hostname: string;
  try {
    hostname = new URL(baseURL).hostname;
  } catch {
    return false;
  }

  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local") ||
    // RFC-1918 private ranges
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)
  );
}
