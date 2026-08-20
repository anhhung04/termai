import fs from "fs";
import path from "path";

import { ExpandedContext } from "../../context/context";

const PROJECT_INSTRUCTIONS_FILE = ".terminal-ai.md";

export function readProjectInstructions(
  cwd: string = process.cwd(),
): ExpandedContext | undefined {
  const filePath = path.join(cwd, PROJECT_INSTRUCTIONS_FILE);
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const context = fs.readFileSync(filePath, "utf8").trim();
  return context
    ? {
        role: "system",
        name: PROJECT_INSTRUCTIONS_FILE,
        template: PROJECT_INSTRUCTIONS_FILE,
        context,
      }
    : undefined;
}
