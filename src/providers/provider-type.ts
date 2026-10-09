export type ProviderType =
  | "openai"
  | "gemini_openai"
  | "openai_compatible"
  | "anthropic"
  | "cli";

//  Types whose execution is delegated to a locally installed AI CLI binary
//  rather than an HTTP API.
const CLI_PROVIDER_TYPES: Record<string, true> = {
  cli: true,
};

export function isCliProviderType(type: string | undefined): boolean {
  return type !== undefined && CLI_PROVIDER_TYPES[type] === true;
}
