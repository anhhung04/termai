import { select, input } from "@inquirer/prompts";
import colors from "colors/safe";
import OpenAI from "openai";

export type AskUserArgs = {
  question: string;
  choices: Array<{ value: string; label: string }>;
  allow_other?: boolean;
};

export const ASK_USER_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "ask_user",
    description:
      "Ask the user a clarifying question with multiple choice answers to gather context or preferences needed for an accurate, tailored response. Use this when the question is genuinely ambiguous and the answer will significantly change your response.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to ask the user",
        },
        choices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "The value returned when this choice is selected",
              },
              label: {
                type: "string",
                description: "The display label shown to the user",
              },
            },
            required: ["value", "label"],
          },
          minItems: 2,
          description: "The choices to present to the user (minimum 2)",
        },
        allow_other: {
          type: "boolean",
          description:
            "If true, adds an 'Other (custom answer)' option that lets the user type a free-form response",
        },
      },
      required: ["question", "choices"],
    },
  },
};

export async function executeAskUserTool(
  args: AskUserArgs,
  isTTYstdout: boolean,
): Promise<string> {
  //  Non-interactive (piped output): auto-select the first option and continue.
  if (!isTTYstdout) {
    return args.choices[0]?.value ?? "";
  }

  const choices = args.choices.map((c) => ({ name: c.label, value: c.value }));
  if (args.allow_other) {
    choices.push({ name: "Other (custom answer)", value: "__other__" });
  }

  console.log(colors.bold(colors.white("AI asks:")));
  const selected = await select({
    message: args.question,
    choices,
  });

  if (selected === "__other__") {
    return await input({ message: "Your answer:" });
  }

  return selected;
}
