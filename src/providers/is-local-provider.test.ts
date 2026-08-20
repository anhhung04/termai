import { isLocalProvider } from "./is-local-provider";
import { ProviderConfiguration } from "../configuration/configuration";

function provider(baseURL: string): ProviderConfiguration {
  return {
    baseURL,
    apiKey: "key",
    model: "m",
    type: "openai_compatible",
    name: "test",
  };
}

describe("isLocalProvider", () => {
  it("returns true for localhost", () => {
    expect(isLocalProvider(provider("http://localhost:11434/v1/"))).toBe(true);
  });

  it("returns true for 127.0.0.1", () => {
    expect(isLocalProvider(provider("http://127.0.0.1:8080/v1/"))).toBe(true);
  });

  it("returns true for ::1 (IPv6 loopback)", () => {
    expect(isLocalProvider(provider("http://[::1]:11434/v1/"))).toBe(true);
  });

  it("returns true for .local mDNS hostname", () => {
    expect(isLocalProvider(provider("http://mybox.local:11434/v1/"))).toBe(
      true,
    );
  });

  it("returns true for RFC-1918 10.x range", () => {
    expect(isLocalProvider(provider("http://10.0.0.5:11434/v1/"))).toBe(true);
  });

  it("returns true for RFC-1918 192.168.x range", () => {
    expect(isLocalProvider(provider("http://192.168.1.100:11434/v1/"))).toBe(
      true,
    );
  });

  it("returns true for RFC-1918 172.16-31 range", () => {
    expect(isLocalProvider(provider("http://172.20.0.1:11434/v1/"))).toBe(true);
  });

  it("returns false for OpenAI", () => {
    expect(isLocalProvider(provider("https://api.openai.com/v1/"))).toBe(false);
  });

  it("returns false for Gemini", () => {
    expect(
      isLocalProvider(
        provider("https://generativelanguage.googleapis.com/v1beta/openai/"),
      ),
    ).toBe(false);
  });

  it("returns false for empty baseURL", () => {
    expect(isLocalProvider(provider(""))).toBe(false);
  });
});
