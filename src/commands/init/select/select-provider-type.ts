import { select } from "@inquirer/prompts";
import { ProviderType } from "../../../providers/provider-type";

export async function selectProviderType(
  defaultType: ProviderType,
  message?: string,
): Promise<ProviderType> {
  return await select({
    message: message || "Provider Type:",
    default: defaultType,
    choices: [
      {
        name: "OpenAI",
        value: "openai",
        description: "OpenAI",
      },
      {
        name: "Gemini (OpenAI)",
        value: "gemini_openai",
        description: "Gemini (using OpenAI compatiblity)",
      },
      {
        name: "Anthropic",
        value: "anthropic",
        description: "Anthropic Messages API",
      },
      {
        name: "OpenAI Compatible",
        value: "openai_compatible",
        description: "Any OpenAI Compatible Provider",
      },
    ],
  });
}
