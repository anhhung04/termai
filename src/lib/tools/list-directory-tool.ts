import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";

export type ListDirArgs = {
  path?: string;
};

export const LIST_DIR_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "list_directory",
    description:
      "List the contents of a directory to understand the project structure or available files. Useful for discovering scripts, config files, or other relevant files before generating a command.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Directory path to list. Defaults to the current working directory.",
        },
      },
      required: [],
    },
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function executeListDirectoryTool(
  args: ListDirArgs,
  cwd: string,
): Promise<string> {
  const targetPath = args.path ? path.resolve(cwd, args.path) : cwd;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(targetPath, { withFileTypes: true });
  } catch (err) {
    return `Error reading directory: ${err instanceof Error ? err.message : String(err)}`;
  }

  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const lines: string[] = [
    `Contents of ${targetPath} (${entries.length} items):`,
  ];
  for (const entry of sorted) {
    if (entry.isDirectory()) {
      lines.push(`  [DIR]  ${entry.name}/`);
    } else {
      let size = "";
      try {
        const stat = fs.statSync(path.join(targetPath, entry.name));
        size = ` (${formatSize(stat.size)})`;
      } catch {
        // ignore stat errors
      }
      lines.push(`  [FILE] ${entry.name}${size}`);
    }
  }

  return lines.join("\n");
}
