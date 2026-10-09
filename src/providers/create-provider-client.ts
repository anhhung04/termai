import OpenAI from "openai";

import { ProviderConfiguration } from "../configuration/configuration";
import { ErrorCode, TerminalAIError } from "../lib/errors";
import { isCredentialReference } from "../configuration/credentials";
import { ResolvedProvider } from "./resolve-provider";

export const PROVIDER_MAX_RETRIES = 4;

export function createProviderClient(provider: ProviderConfiguration | ResolvedProvider): OpenAI {
  const resolved = toResolvedProvider(provider);

  if (resolved.provider.type === "cli") {
    throw new TerminalAIError(
      ErrorCode.InvalidOperation,
      `provider '${resolved.provider.name}' is a CLI provider and has no HTTP client`,
    );
  }

  //  A credential reference must be resolved before a client is created, and
  //  only the runtime-resolved provider carries the resolved value.
  if (isCredentialReference(resolved.provider.apiKey) && resolved.apiKey === undefined) {
    throw new TerminalAIError(
      ErrorCode.InvalidConfiguration,
      `provider '${resolved.provider.name}' uses an unresolved credential reference - use the runtime-resolved provider`,
    );
  }

  //  Merge configured headers with a deterministic precedence: explicit
  //  configuration wins, and the auth header is never duplicated by the SDK.
  const headers: Record<string, string> = { ...resolved.headers };
  const authHeader = resolved.provider.authHeader;
  if (authHeader) {
    const value = resolved.apiKey ? `${resolved.apiKey}` : "";
    if (!value && authHeader.toLowerCase() === "authorization") {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `provider '${resolved.provider.name}' requires an API key for its Authorization header`,
      );
    }
    if (value) {
      headers[authHeader] =
        authHeader.toLowerCase() === "authorization" ? `Bearer ${value}` : value;
    }
  }

  return new OpenAI({
    apiKey: resolved.apiKey || "",
    baseURL: resolved.provider.baseURL,
    maxRetries: PROVIDER_MAX_RETRIES,
    ...(Object.keys(headers).length > 0 ? { defaultHeaders: headers } : {}),
  });
}

function toResolvedProvider(
  provider: ProviderConfiguration | ResolvedProvider,
): ResolvedProvider {
  if (isResolvedProvider(provider)) return provider;

  const plain = provider as ProviderConfiguration;
  return {
    provider: plain,
    apiKey: typeof plain.apiKey === "string" ? plain.apiKey : undefined,
    headers: {},
  };
}

function isResolvedProvider(
  value: ProviderConfiguration | ResolvedProvider,
): value is ResolvedProvider {
  return (
    typeof value === "object" &&
    value !== null &&
    "provider" in value &&
    "headers" in value
  );
}
