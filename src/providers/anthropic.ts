import OpenAI from "openai";

import { TerminalAIError, ErrorCode } from "../lib/errors";
import { ToolHandler } from "../lib/tools/call-with-tools";
import { ChatPipelineParameters } from "../chat-pipeline/ChatPipelineParameters";
import { startSpinner } from "../theme";
import { translateError } from "../lib/translate-error";

const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOOL_ROUNDS = 5;

type AnthropicMessage = {
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | {
            type: "image";
            source: { type: "base64"; media_type: string; data: string };
          }
        | { type: "tool_use"; id: string; name: string; input: unknown }
        | { type: "tool_result"; tool_use_id: string; content: string }
      >;
};

type AnthropicResponse = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
  >;
};

function parseDataUri(url: string) {
  const match = /^data:([^;,]+);base64,(.*)$/.exec(url);
  return match
    ? {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: match[1],
          data: match[2],
        },
      }
    : undefined;
}

export function chatMessagesToAnthropic(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): { system?: string; messages: AnthropicMessage[] } {
  const system = messages
    .filter(
      (message) => message.role === "system" || message.role === "developer",
    )
    .map((message) =>
      typeof message.content === "string" ? message.content : "",
    )
    .filter(Boolean)
    .join("\n\n");
  const anthropicMessages: AnthropicMessage[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    if (typeof message.content === "string") {
      anthropicMessages.push({ role: message.role, content: message.content });
      continue;
    }
    const content: AnthropicMessage["content"] extends string
      ? never
      : Exclude<AnthropicMessage["content"], string> = [];
    for (const part of message.content ?? []) {
      if (part.type === "text") content.push({ type: "text", text: part.text });
      else if (part.type === "image_url") {
        const image = parseDataUri(part.image_url.url);
        content.push(image ?? { type: "text", text: part.image_url.url });
      }
    }
    anthropicMessages.push({ role: message.role, content });
  }
  return { system: system || undefined, messages: anthropicMessages };
}

export function chatToolsToAnthropic(
  tools: OpenAI.Chat.Completions.ChatCompletionTool[],
) {
  return tools.map(({ function: tool }) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters ?? { type: "object", properties: {} },
  }));
}

export async function getAnthropicResponseWithTools(
  params: ChatPipelineParameters,
  tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  handlers: Record<string, ToolHandler>,
): Promise<string> {
  const spinner = await startSpinner(params.executionContext.isTTYstdout);
  try {
    const { system, messages } = chatMessagesToAnthropic(
      params.chatContext.messages,
    );
    const url = new URL(
      "messages",
      `${params.executionContext.provider.baseURL.replace(/\/?$/, "/")}`,
    ).toString();
    const headers = {
      "content-type": "application/json",
      "x-api-key": params.executionContext.provider.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: params.executionContext.provider.model,
          max_tokens: 4096,
          ...(system ? { system } : {}),
          messages,
          tools: chatToolsToAnthropic(tools),
        }),
      });
      if (!response.ok) {
        throw new TerminalAIError(
          ErrorCode.OpenAIError,
          `Anthropic provider error (${response.status}): ${await response.text()}`,
        );
      }
      const result = (await response.json()) as AnthropicResponse;
      const calls = result.content.filter(
        (
          item,
        ): item is Extract<
          AnthropicResponse["content"][number],
          { type: "tool_use" }
        > => item.type === "tool_use",
      );
      if (!calls.length) {
        const text = result.content
          .filter(
            (
              item,
            ): item is Extract<
              AnthropicResponse["content"][number],
              { type: "text" }
            > => item.type === "text",
          )
          .map((item) => item.text)
          .join("\n");
        if (text) return text;
        throw new TerminalAIError(
          ErrorCode.InvalidOperation,
          "No response received - try 'ai check' to validate your config",
        );
      }
      messages.push({ role: "assistant", content: result.content });
      messages.push({
        role: "user",
        content: await Promise.all(
          calls.map(async (call) => ({
            type: "tool_result" as const,
            tool_use_id: call.id,
            content: handlers[call.name]
              ? await handlers[call.name](
                  call.input,
                  params.executionContext.isTTYstdout,
                )
              : `Unknown tool: ${call.name}`,
          })),
        ),
      });
    }
    throw new TerminalAIError(
      ErrorCode.InvalidOperation,
      "Tool call loop exceeded maximum rounds (5) — try rephrasing your request",
    );
  } catch (err) {
    throw translateError(err);
  } finally {
    spinner.stop();
  }
}
