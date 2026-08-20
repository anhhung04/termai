import OpenAI from "openai";
import os from "os";
import { spawnSync } from "child_process";

import { confirm, input } from "@inquirer/prompts";
import colors from "colors/safe";

import { ExecutionContext } from "../../execution-context/execution-context";
import { writeClipboard } from "../../lib/clipboard";
import { loadStdinInput } from "../../input/file-input/load-stdin-input";
import { startSpinner } from "../../theme";
import { translateError } from "../../lib/translate-error";
import { ErrorCode, TerminalAIError } from "../../lib/errors";
import { callWithTools, ToolHandler } from "../../lib/tools/call-with-tools";
import {
  ASK_USER_TOOL,
  AskUserArgs,
  executeAskUserTool,
} from "../../lib/tools/ask-user-tool";
import {
  LIST_DIR_TOOL,
  ListDirArgs,
  executeListDirectoryTool,
} from "../../lib/tools/list-directory-tool";
import {
  RUN_COMMAND_TOOL,
  RunCommandArgs,
  executeRunCommandTool,
} from "../../lib/tools/run-command-tool";
import {
  SEARCH_WEB_TOOL,
  SearchWebArgs,
  executeSearchWebTool,
} from "../../lib/tools/search-web-tool";
import {
  FETCH_PAGE_TOOL,
  FetchPageArgs,
  executeFetchPageTool,
} from "../../lib/tools/fetch-page-tool";
import { isLocalProvider } from "../../providers/is-local-provider";
import { createProviderClient } from "../../providers/create-provider-client";
import {
  NETWORK_SCAN_TOOL,
  NetworkScanArgs,
  executeNetworkScanTool,
} from "../../lib/tools/network-scan-tool";
import {
  SERVICE_ENUMERATION_TOOL,
  ServiceEnumerationArgs,
  executeServiceEnumerationTool,
} from "../../lib/tools/service-enumeration-tool";

export async function generate(
  executionContext: ExecutionContext,
  naturalLanguageInput: string | undefined,
  autoRun: boolean = false,
  copy: boolean = false,
): Promise<void> {
  //  Always read stdin when it's piped — it may carry data to work with even
  //  when an instruction argument is also provided.
  //  e.g. cat hosts.txt | ai gen "give me an nmap command to scan these hosts"
  const stdinContent = !executionContext.isTTYstdin
    ? (await loadStdinInput(executionContext.process.stdin))?.content?.trim()
    : undefined;

  //  Resolve the instruction: from the CLI argument, or interactive prompt.
  //  If only stdin was piped with no argument, treat it as the full description.
  let instruction = naturalLanguageInput;
  if (!instruction) {
    if (stdinContent && !executionContext.isTTYstdin) {
      //  Stdin-only: treat the piped text itself as the description.
      instruction = stdinContent;
    } else {
      instruction = await input({
        message: "Describe the command you want to run:",
      });
    }
  }

  if (!instruction?.trim()) {
    throw new TerminalAIError(
      ErrorCode.InvalidOperation,
      "No description provided",
    );
  }

  //  Build the user message. When both an instruction and stdin data are
  //  present, combine them so the LLM has both the task and the input to
  //  work with.
  const userMessage =
    naturalLanguageInput && stdinContent
      ? `${instruction}\n\nInput data:\n${stdinContent}`
      : instruction;

  //  Build context to send to the LLM. We send env variable names (keys) only,
  //  never values, to avoid leaking secrets or sensitive data.
  const envKeys = Object.keys(executionContext.process.env).join(", ");
  const shell = executionContext.process.env["SHELL"] ?? "/bin/sh";
  const cwd = process.cwd();
  const platform = os.platform();

  const sharedContext = `
Environment:
- Shell: ${shell}
- Working directory: ${cwd}
- OS: ${platform}
- Available environment variable names (values not shown): ${envKeys}`;

  const toolsContext = `
Available tools for gathering context before generating the command:
- ask_user: clarify ambiguous intent with a multiple-choice question
- list_directory: inspect local file structure (no permission needed)
- run_command: check installed tools, versions, running processes (asks user permission)
- search_web: search DuckDuckGo for current syntax, docs, or best practices
- fetch_page: read a documentation page or article from a URL

Use these tools proactively when they would produce a more accurate command. For example:
- If the command depends on knowing which tool version is installed, use run_command.
- If the exact flag syntax is unclear, use search_web then fetch_page to read the docs.
- If the target file or directory structure matters, use list_directory.
- If the task is ambiguous, use ask_user before searching or running anything.`;

  const commandQualityRules = `
Command quality:
- Quote all variables and command substitutions to handle spaces and special characters: "$VAR", "$(cmd)".
- Use human-readable size flags when displaying results: -h with du, df, ls -lh; sort -h to sort by size.
- In find, use -exec cmd {} + (batch form) instead of -exec cmd {} \\; to reduce subprocess overhead.
- Avoid useless use of cat: pipe files directly (grep pattern file) instead of (cat file | grep pattern).
- When the result set may be large and the user likely wants a summary, pipe through sort | head -N.
- Chain dependent steps with && so the pipeline aborts on the first failure; use ; only for independent steps.
- When commands must handle filenames with spaces or special characters, use find -print0 with xargs -0.
- Prefer widely available POSIX tools (find, awk, sed, sort, cut) over rarely installed alternatives unless you have confirmed the tool is present.
- Include -r/-R (recursive) and appropriate depth flags only when the task actually requires recursion.`;

  // Shared constant to reduce token usage
  const SHARED_PROMPT = `${sharedContext}\n${toolsContext}\n${commandQualityRules}`;

  const isPipelineMode = !!(naturalLanguageInput && stdinContent);
  const systemPrompt = isPipelineMode
    ? `You are a shell command generator that works with input data. The user will provide input data and an instruction. Your job is to:
1. Parse and extract the relevant values from the input data (e.g. hostnames, ports, IDs, paths).
2. Assign each extracted value to a descriptive inline environment variable.
3. Build the command using those variables, with the assignments prefixed on the same line.

Output format — inline env var assignments followed by the command:
  HOST=192.168.1.1 PORT=8080 nmap -sV --script vuln $HOST -p $PORT

Rules:
- Output ONLY the raw shell command with its inline variable assignments. No explanation, no markdown, no code fences.
- Use SCREAMING_SNAKE_CASE for variable names that clearly describe the value (HOST, PORT, TARGET, FILE, USER, DB, etc.).
- For multiple values of the same type, use numbered variables: HOST1=10.0.0.1 HOST2=10.0.0.2.
- All extracted values must appear in the variable assignments — never hardcode values inside the command itself.
- The command must be immediately runnable as-is, and also easy to reuse by editing only the variable values.

Error handling:
- For commands that traverse the filesystem (find, du, ls -R, stat), append 2>/dev/null to suppress expected "Permission denied" noise.
- When a pipeline step may legitimately produce no output (grep, awk filters), append || true so a non-match does not abort the pipeline.
- Use set -o pipefail only when every stage of a pipeline must succeed; omit it otherwise.
${SHARED_PROMPT}`
    : `You are a shell command generator. Given a natural language description, output ONLY the final shell command to run — no explanation, no markdown, no code fences.

Before generating the command, use your available tools to gather the context needed for an accurate result. Search for current documentation when syntax is unclear; inspect the local environment when file paths or installed tools matter; ask the user when the intent is genuinely ambiguous.

Error handling:
- For commands that traverse the filesystem (find, du, ls -R, stat), append 2>/dev/null to suppress expected "Permission denied" noise.
- When a pipeline step may legitimately produce no output (grep, awk filters), append || true so a non-match does not abort the pipeline.
- Use set -o pipefail only when every stage of a pipeline must succeed; omit it otherwise.
${SHARED_PROMPT}`;

  //  Call the LLM to generate the command.
  const openai = createProviderClient(executionContext.provider);

  const local = isLocalProvider(executionContext.provider);
  const generateTools = [
    ASK_USER_TOOL,
    LIST_DIR_TOOL,
    RUN_COMMAND_TOOL,
    ...(local ? [] : [SEARCH_WEB_TOOL, FETCH_PAGE_TOOL]),
    NETWORK_SCAN_TOOL,
    SERVICE_ENUMERATION_TOOL,
  ];
  const generateHandlers: Record<string, ToolHandler> = {
    ask_user: (args, isTTY) => executeAskUserTool(args as AskUserArgs, isTTY),
    list_directory: (args) =>
      executeListDirectoryTool(args as ListDirArgs, cwd),
    run_command: (args, isTTY) =>
      executeRunCommandTool(args as RunCommandArgs, isTTY, cwd, shell),
    network_scan: (args) => executeNetworkScanTool(args as NetworkScanArgs),
    service_enumeration: (args) =>
      executeServiceEnumerationTool(args as ServiceEnumerationArgs),
    ...(local
      ? {}
      : {
          search_web: (args) => executeSearchWebTool(args as SearchWebArgs),
          fetch_page: (args) => executeFetchPageTool(args as FetchPageArgs),
        }),
  };

  const spinner = await startSpinner(
    executionContext.isTTYstdout,
    "Generating command...",
  );
  let command: string;
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];
    command = (
      await callWithTools(
        openai,
        executionContext.provider.model,
        messages,
        executionContext.isTTYstdout,
        generateTools,
        generateHandlers,
        spinner,
      )
    ).trim();
    spinner.stop();

    if (!command) {
      throw new TerminalAIError(
        ErrorCode.InvalidOperation,
        "No command was generated - try 'ai check' to validate your config",
      );
    }
  } catch (err) {
    spinner.fail();
    throw translateError(err);
  }

  //  Display the generated command.
  console.log(colors.white(colors.bold("Generated command:")));
  console.log(colors.cyan(command));
  if (copy) {
    await writeClipboard(command, true);
    return;
  }

  //  In non-interactive mode (e.g. piped), print the command and exit without
  //  asking for confirmation.
  if (!executionContext.isTTYstdin || !executionContext.isTTYstdout) {
    return;
  }

  //  Ask the user for permission to run (or auto‑run if --yes was used).
  let run: boolean;
  if (autoRun) {
    run = true;
  } else {
    run = await confirm({
      message: "Run this command?",
      default: false,
    });
  }

  if (!run) {
    return;
  }

  //  Execute the command in a child shell, inheriting the current process's
  //  stdin/stdout/stderr, cwd, and environment so interactive programs work.
  //  spawnSync ensures the parent waits synchronously for the child to finish
  //  and that all output is displayed directly in the current terminal.
  const currentShell = executionContext.process.env["SHELL"] || "/bin/sh";
  const result = spawnSync(currentShell, ["-c", command], {
    stdio: "inherit",
    env: executionContext.process.env,
    cwd: process.cwd(),
  });

  if (result.error) {
    throw translateError(result.error);
  }
  if (result.status !== null && result.status !== 0) {
    console.log(colors.yellow(`Command exited with code ${result.status}`));
  }
}
