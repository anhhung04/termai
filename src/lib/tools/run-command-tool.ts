import { execSync } from "child_process";
import { confirm } from "@inquirer/prompts";
import colors from "colors/safe";
import OpenAI from "openai";

export type RunCommandArgs = {
  command: string;
  reason: string;
};

export const RUN_COMMAND_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "run_command",
    description:
      "Run a read-only shell command to gather information about the environment, installed tools, running processes, or system state. Only use for safe, non-destructive commands (e.g. checking versions, listing processes, querying service status).",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "The shell command to run. Must be read-only and non-destructive.",
        },
        reason: {
          type: "string",
          description:
            "Why this information is needed to generate a more accurate command.",
        },
      },
      required: ["command", "reason"],
    },
  },
};

const MAX_OUTPUT_CHARS = 4000;

export async function executeRunCommandTool(
  args: RunCommandArgs,
  isTTYstdout: boolean,
  cwd: string,
  shell: string,
): Promise<string> {
  //  Non-interactive: cannot ask for permission, decline gracefully.
  if (!isTTYstdout) {
    return "Cannot request command execution in non-interactive mode.";
  }

  console.log();
  console.log(colors.bold(colors.white("AI wants to run a command:")));
  console.log(`  Reason: ${args.reason}`);
  console.log(`  ${colors.cyan("$")} ${args.command}`);

  const allowed = await confirm({
    message: "Allow this command?",
    default: true,
  });

  if (!allowed) {
    return "User declined to run this command.";
  }

  //  Security note: execSync with shell=true is intentional here. The user
  //  has explicitly approved the exact command string displayed above. This
  //  tool exists to run arbitrary shell commands for context-gathering —
  //  shell features (pipes, redirections) are required. The approval prompt
  //  above is the security boundary.
  try {
    const output = execSync(args.command, {
      cwd,
      shell,
      timeout: 10000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const trimmed = output.trim();
    if (!trimmed) {
      console.log(colors.dim("  ✓ Command ran (no output)"));
      return "(command produced no output)";
    }

    const lineCount = trimmed.split("\n").length;
    console.log(
      colors.dim(
        `  ✓ Output captured (${lineCount} line${lineCount === 1 ? "" : "s"})`,
      ),
    );

    return trimmed.length > MAX_OUTPUT_CHARS
      ? trimmed.slice(0, MAX_OUTPUT_CHARS) + "\n[output truncated]"
      : trimmed;
  } catch (err) {
    const execErr = err as {
      message?: string;
      stdout?: string;
      stderr?: string;
    };
    console.log(colors.dim("  ✗ Command failed"));
    const output = [execErr.stdout, execErr.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    return output || `Command failed: ${execErr.message ?? String(err)}`;
  }
}
