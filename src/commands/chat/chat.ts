import { ExecutionContext } from "../../execution-context/execution-context";
import { executeChatPipeline } from "../../chat-pipeline/chat-pipeline-completion-api";
import { executeChatPipeline as executeAssistantPipeline } from "../../chat-pipeline/chat-pipeline-assistant-api";
import { ensureApiKey } from "../../chat-pipeline/stages/ensure-api-key";
import {
  ChatContext,
  initialChatContext,
} from "../../chat-pipeline/ChatContext";
import { loadConversation } from "../../conversations/conversations";

export async function chat(
  executionContext: ExecutionContext,
  inputMessage: string | undefined,
  enableContextPrompts: boolean,
  enableOutputPrompts: boolean,
  copy: boolean,
  raw: boolean,
  responses: boolean,
  anthropic: boolean,
  format: "text" | "markdown" | "json",
  enableProjectContext: boolean,
  conversationName: string | undefined,
  assistant: boolean,
  files: string[],
  imageFiles: string[],
) {
  if (!(["text", "markdown", "json"] as string[]).includes(format)) {
    throw new Error("format must be text, markdown, or json");
  }

  const useAnthropic =
    anthropic || executionContext.provider.type === "anthropic";
  if ([assistant, responses, useAnthropic].filter(Boolean).length > 1) {
    throw new Error(
      "--assistant, --responses, and --anthropic cannot be combined",
    );
  }

  //  Ensure we are configured sufficiently.
  await ensureApiKey(executionContext);

  //  A clean initial chat context.
  const chatContext: ChatContext = {
    ...initialChatContext(),
    messages: conversationName
      ? loadConversation(executionContext.configFilePath, conversationName)
      : [],
    filePathsOutbox: files,
    imageFilePathsOutbox: imageFiles,
  };

  if (!assistant) {
    return await executeChatPipeline({
      executionContext,
      chatContext,
      inputMessage,
      options: {
        enableContextPrompts,
        enableOutputPrompts,
        copy,
        raw,
        responses,
        anthropic: useAnthropic,
        format,
        enableProjectContext,
        conversationName,
      },
    });
  } else {
    return await executeAssistantPipeline({
      executionContext,
      chatContext,
      inputMessage,
      options: {
        enableContextPrompts,
        enableOutputPrompts,
        copy,
        raw,
        responses,
        anthropic: useAnthropic,
        format,
        enableProjectContext,
        conversationName,
      },
    });
  }
}
