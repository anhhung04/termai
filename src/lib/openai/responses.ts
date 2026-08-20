import OpenAI from "openai";

export function chatMessagesToResponsesInput(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): OpenAI.Responses.ResponseInput {
  return messages.map((message) => {
    const content =
      typeof message.content === "string"
        ? message.content
        : (message.content ?? []).map((part) => {
            if (part.type === "text") {
              return { type: "input_text", text: part.text };
            }
            if (part.type === "image_url") {
              return { type: "input_image", image_url: part.image_url.url };
            }
            return part;
          });

    // Responses input has no assistant message role. Preserve saved chat history
    // as user-visible transcript rather than sending an invalid request.
    return message.role === "assistant"
      ? { role: "user", content: `Previous assistant response:\n${content}` }
      : { role: message.role, content };
  }) as OpenAI.Responses.ResponseInput;
}

export function chatToolsToResponsesTools(
  tools: OpenAI.Chat.Completions.ChatCompletionTool[],
): OpenAI.Responses.Tool[] {
  return tools.map(({ function: tool }) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters ?? null,
    strict: false,
  }));
}
