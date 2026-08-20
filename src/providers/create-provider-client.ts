import OpenAI from "openai";

import { ProviderConfiguration } from "../configuration/configuration";

export const PROVIDER_MAX_RETRIES = 4;

export function createProviderClient(provider: ProviderConfiguration): OpenAI {
  return new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    maxRetries: PROVIDER_MAX_RETRIES,
  });
}
