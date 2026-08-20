import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, expect, test } from "@jest/globals";

import { readProjectInstructions } from "./project-instructions";

const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((directory) =>
      fs.rmSync(directory, { recursive: true, force: true }),
    ),
);

test("loads .terminal-ai.md as a system prompt", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "terminal-ai-"));
  directories.push(directory);
  fs.writeFileSync(path.join(directory, ".terminal-ai.md"), "Use pnpm.");

  expect(readProjectInstructions(directory)).toMatchObject({
    role: "system",
    context: "Use pnpm.",
  });
});
