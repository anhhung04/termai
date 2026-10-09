import fs from "fs";
import path from "path";

export type CliToolStatus = {
  id: string;
  label: string;
  /** Environment variable, if any, which should hold the credential. */
  apiKeyEnv?: string;
  /** Arguments that put the CLI into non-interactive prompt mode. */
  args?: string[];
  /** Argument used to select a model, when supported. */
  modelArg?: string;
  found: boolean;
  path?: string;
};

/**
 * Known AI CLIs we can detect. Detection only inspects the filesystem; the
 * binaries are never executed.
 */
export const KNOWN_AI_CLIS: Omit<CliToolStatus, "found" | "path">[] = [
  { id: "codex", label: "OpenAI Codex CLI", apiKeyEnv: "OPENAI_API_KEY", args: ["exec"] },
  { id: "claude", label: "Anthropic Claude Code", apiKeyEnv: "ANTHROPIC_API_KEY", args: ["--print"] },
  { id: "omp", label: "Oh My Pi", apiKeyEnv: "OMP_API_KEY", args: ["run"] },
  { id: "gemini", label: "Gemini CLI", apiKeyEnv: "GEMINI_API_KEY", args: ["-p"] },
  { id: "aider", label: "Aider", apiKeyEnv: "OPENAI_API_KEY", args: ["--message"] },
  { id: "opencode", label: "opencode", apiKeyEnv: "OPENAI_API_KEY", args: ["run"] },
];

const WINDOWS_EXECUTABLE_EXTENSIONS = [".exe", ".cmd", ".bat", ".ps1"];

export function executableExtensions(platform: NodeJS.Platform): string[] {
  return platform === "win32" ? ["", ...WINDOWS_EXECUTABLE_EXTENSIONS] : [""];
}

/**
 * Determine whether a command resolves to an executable on PATH, without
 * running it. Uses filesystem inspection only.
 */
export function findExecutable(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (!command.trim()) return undefined;

  const extensions = executableExtensions(platform);
  const pathValue = env["PATH"] || env["Path"] || "";
  const searchDirs = pathValue.split(path.delimiter).filter((dir) => dir.length > 0);
  const hasSeparator = command.includes("/") || command.includes("\\");
  const candidates = hasSeparator ? [command] : searchDirs.map((dir) => path.join(dir, command));

  for (const candidate of candidates) {
    for (const extension of extensions) {
      const fullPath = candidate + extension;
      if (isExecutableFile(fullPath, platform)) return fullPath;
    }
  }
  return undefined;
}

function isExecutableFile(candidate: string, platform: NodeJS.Platform): boolean {
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) return false;
    if (platform === "win32") return true;
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function detectCliTools(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  known: Omit<CliToolStatus, "found" | "path">[] = KNOWN_AI_CLIS,
): CliToolStatus[] {
  return known.map((tool) => {
    const found = findExecutable(tool.id, env, platform);
    return found !== undefined
      ? { ...tool, found: true, path: found }
      : { ...tool, found: false };
  });
}

export function getKnownCliTool(id: string): Omit<CliToolStatus, "found" | "path"> | undefined {
  return KNOWN_AI_CLIS.find((tool) => tool.id === id);
}
