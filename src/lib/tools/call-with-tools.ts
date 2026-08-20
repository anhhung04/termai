import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";

import { ErrorCode, TerminalAIError } from "../errors";

const MAX_TOOL_ROUNDS = 5;

/**
 * ToolHandler — a function that executes a single tool call on behalf of the
 * LLM. Receives the parsed arguments and the TTY flag, returns a string result
 * that is fed back to the model as a `role: "tool"` message.
 */
export type ToolHandler = (
  args: unknown,
  isTTYstdout: boolean,
) => Promise<string>;

/**
 * callWithTools — calls the LLM with the provided tools available, executes
 * any tool calls the model makes (via the matching handler), then re-calls
 * the model with the tool results. Loops until the model returns a plain text
 * response or MAX_TOOL_ROUNDS is reached.
 *
 * @param openai      — Configured OpenAI client.
 * @param model       — Model identifier string.
 * @param messages    — Full conversation history to send (not mutated).
 * @param isTTYstdout — Whether stdout is interactive; gates interactive prompts.
 * @param tools       — Tool definitions to pass to the API.
 * @param handlers    — Map from tool name to its execution handler.
 * @param spinner     — Optional spinner to stop before showing interactive prompts.
 */
export async function callWithTools(
  openai: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  isTTYstdout: boolean,
  tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  handlers: Record<string, ToolHandler>,
  spinner?: { stop: () => void },
): Promise<string> {
  const localMessages: ChatCompletionMessageParam[] = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await openai.chat.completions.create({
      model,
      messages: localMessages,
      tools,
      stream: false,
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new TerminalAIError(
        ErrorCode.InvalidOperation,
        "No response received - try 'ai check' to validate your config",
      );
    }

    //  No tool calls — the model produced its final text response.
    if (!choice.message.tool_calls?.length) {
      const content = choice.message.content;
      if (!content) {
        throw new TerminalAIError(
          ErrorCode.InvalidOperation,
          "No response received - try 'ai check' to validate your config",
        );
      }
      return content;
    }

    //  The model wants to call tools. Stop the spinner before any interactive
    //  prompts, add the assistant message to history, then execute each call.
    spinner?.stop();

    localMessages.push(choice.message as ChatCompletionMessageParam);

    for (const toolCall of choice.message.tool_calls) {
      const handler = handlers[toolCall.function.name];

      let result: string;
      if (!handler) {
        result = `Unknown tool: ${toolCall.function.name}`;
      } else {
        let args: unknown;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }
        result = await handler(args, isTTYstdout);
      }

      localMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  throw new TerminalAIError(
    ErrorCode.InvalidOperation,
    "Tool call loop exceeded maximum rounds (5) — try rephrasing your request",
  );
}
