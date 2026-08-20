import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, expect, test } from "@jest/globals";

import { loadConversation, saveConversation } from "./conversations";

const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((directory) =>
      fs.rmSync(directory, { recursive: true, force: true }),
    ),
);

test("saves and loads a named conversation", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "terminal-ai-"));
  directories.push(directory);
  const configFilePath = path.join(directory, "config.yaml");
  const messages = [{ role: "user" as const, content: "hello" }];

  saveConversation(configFilePath, "work", messages);

  expect(loadConversation(configFilePath, "work")).toEqual(messages);
});

test("rejects traversal in conversation names", () => {
  expect(() => loadConversation("/tmp/config.yaml", "../work")).toThrow(
    "conversation names may contain",
  );
});
