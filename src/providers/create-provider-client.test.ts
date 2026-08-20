import { getDefaultConfiguration } from "../configuration/configuration";
import {
  createProviderClient,
  PROVIDER_MAX_RETRIES,
} from "./create-provider-client";

describe("createProviderClient", () => {
  it("uses the configured provider and retries transient failures", () => {
    const provider = { ...getDefaultConfiguration(), name: "test" };
    const client = createProviderClient(provider);

    expect(client.baseURL).toBe(provider.baseURL);
    expect(client.maxRetries).toBe(PROVIDER_MAX_RETRIES);
  });
});
