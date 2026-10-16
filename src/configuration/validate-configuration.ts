import { ErrorCode, TerminalAIError } from "../lib/errors";
import { Configuration, ProviderConfiguration } from "./configuration";
import {
  isCredentialReference,
  validateCredentialReference,
} from "./credentials";
import { isCliProviderType } from "../providers/provider-type";
import { getKnownCliTool } from "../providers/cli-detection";

export function validateConfiguration(config: Configuration) {
  //  If we have a provider name, the provider must exist.
  if (config.provider && !config.providers[config.provider]) {
    throw new TerminalAIError(
      ErrorCode.InvalidConfiguration,
      `provider '${config.provider}' not found in 'providers' block - check ~/.ai/config.yaml or run 'ai init'`,
    );
  }

  //  Validate the root provider shape.
  validateProviderFields(
    {
      name: "root",
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model: config.model,
    },
    "root configuration",
    false,
  );

  //  Validate every configured provider.
  for (const name of Object.keys(config.providers || {})) {
    const provider = config.providers[name];
    if (!provider || typeof provider !== "object") {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `provider '${name}' must be a mapping`,
      );
    }
    validateProviderFields(provider, `providers.${name}`, true);
  }

  //  Validate the langfuse credential references, if present.
  const langfuse = config.integrations?.langfuse;
  if (langfuse) {
    validateOptionalSecret(
      langfuse.secretKey,
      "integrations.langfuse.secretKey",
    );
    validateOptionalSecret(
      langfuse.publicKey,
      "integrations.langfuse.publicKey",
    );
  }
}

function validateOptionalSecret(value: unknown, fieldName: string): void {
  if (value === undefined || value === "") return;
  if (typeof value === "string") return;
  validateCredentialReference(value, fieldName);
}

function validateProviderFields(
  provider: ProviderConfiguration,
  fieldName: string,
  requireIdentity: boolean,
): void {
  validateOptionalSecret(provider.apiKey, `${fieldName}.apiKey`);

  if (requireIdentity && !provider.name) {
    throw new TerminalAIError(
      ErrorCode.InvalidConfiguration,
      `${fieldName}.name must be set`,
    );
  }

  if (isCliProviderType(provider.type)) {
    const tool = provider.cli?.tool;
    if (!tool) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `${fieldName}.cli.tool must be set for 'cli' providers`,
      );
    }
    if (!getKnownCliTool(tool)) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `${fieldName}.cli.tool '${tool}' is not a recognised CLI - run 'ai init' to see detected tools`,
      );
    }
    if (
      provider.cli?.timeoutMs !== undefined &&
      (provider.cli.timeoutMs < 1 || provider.cli.timeoutMs > 600000)
    ) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `${fieldName}.cli.timeoutMs must be between 1 and 600000 milliseconds`,
      );
    }
    return;
  }

  if (provider.baseURL !== undefined && !isValidUrl(provider.baseURL)) {
    throw new TerminalAIError(
      ErrorCode.InvalidConfiguration,
      `${fieldName}.baseURL '${provider.baseURL}' is not a valid absolute URL`,
    );
  }

  if (provider.headers !== undefined) {
    if (
      typeof provider.headers !== "object" ||
      Array.isArray(provider.headers)
    ) {
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `${fieldName}.headers must be a mapping of header name to value`,
      );
    }
    for (const headerName of Object.keys(provider.headers)) {
      if (!/^[A-Za-z0-9-]+$/.test(headerName)) {
        throw new TerminalAIError(
          ErrorCode.InvalidConfiguration,
          `${fieldName}.headers['${headerName}'] is not a valid HTTP header name`,
        );
      }
      const headerValue = provider.headers[headerName];
      if (typeof headerValue === "string") continue;
      if (isCredentialReference(headerValue)) {
        validateCredentialReference(
          headerValue,
          `${fieldName}.headers['${headerName}']`,
        );
        continue;
      }
      throw new TerminalAIError(
        ErrorCode.InvalidConfiguration,
        `${fieldName}.headers['${headerName}'] must be a string or credential reference`,
      );
    }
  }

  if (
    provider.authHeader !== undefined &&
    !/^[A-Za-z0-9-]+$/.test(provider.authHeader)
  ) {
    throw new TerminalAIError(
      ErrorCode.InvalidConfiguration,
      `${fieldName}.authHeader is not a valid HTTP header name`,
    );
  }
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}
