import fs from "fs";
import path from "path";
import OpenAI from "openai";

import { ErrorCode, TerminalAIError } from "../lib/errors";

const CONVERSATIONS_FOLDER = "conversations";
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

type StoredConversation = {
  version: 1;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
};

function conversationPath(configFilePath: string, name: string): string {
  if (!NAME_PATTERN.test(name)) {
    throw new TerminalAIError(
      ErrorCode.InvalidOperation,
      "conversation names may contain letters, numbers, dots, underscores, and hyphens",
    );
  }

  return path.join(
    path.dirname(configFilePath),
    CONVERSATIONS_FOLDER,
    `${name}.json`,
  );
}

export function loadConversation(
  configFilePath: string,
  name: string,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const filePath = conversationPath(configFilePath, name);
  if (!fs.existsSync(filePath)) {
    throw new TerminalAIError(
      ErrorCode.InvalidOperation,
      `conversation '${name}' does not exist`,
    );
  }

  try {
    const stored = JSON.parse(
      fs.readFileSync(filePath, "utf8"),
    ) as StoredConversation;
    if (stored.version !== 1 || !Array.isArray(stored.messages)) {
      throw new Error("invalid conversation format");
    }
    return stored.messages;
  } catch (error) {
    throw new TerminalAIError(
      ErrorCode.InvalidOperation,
      `unable to load conversation '${name}': ${error}`,
      error,
    );
  }
}

export function saveConversation(
  configFilePath: string,
  name: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): void {
  const filePath = conversationPath(configFilePath, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ version: 1, messages } satisfies StoredConversation, null, 2)}\n`,
  );
}
