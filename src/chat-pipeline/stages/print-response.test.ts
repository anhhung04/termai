import { expect, jest, test } from "@jest/globals";

import { printResponse } from "./print-response";
import { OutputIntent } from "./parse-input";
import { ChatPipelineParameters } from "../ChatPipelineParameters";
import { ChatResponse } from "./parse-response";

const params = (format: "text" | "markdown" | "json"): ChatPipelineParameters =>
  ({
    executionContext: {
      configFilePath: "/tmp/config.yaml",
      config: {} as ChatPipelineParameters["executionContext"]["config"],
      process: {} as ChatPipelineParameters["executionContext"]["process"],
      provider: {
        name: "test",
        apiKey: "",
        baseURL: "",
        model: "test-model",
      },
      isFirstRun: false,
      isTTYstdin: false,
      isTTYstdout: false,
    },
    chatContext: {} as ChatPipelineParameters["chatContext"],
    inputMessage: undefined,
    options: {
      enableContextPrompts: false,
      enableOutputPrompts: false,
      copy: false,
      raw: false,
      format,
      enableProjectContext: false,
    },
  }) as ChatPipelineParameters;

const response = {
  rawMarkdownResponse: "**hello**",
  plainTextFormattedResponse: "hello",
  colourFormattedResponseWithPrompt: "hello",
  codeBlocks: [],
} as ChatResponse;

test("prints exactly one JSON object in json mode", async () => {
  const log = jest.spyOn(console, "log").mockImplementation(() => undefined);

  await printResponse(params("json"), response, OutputIntent.Chat);

  expect(log).toHaveBeenCalledTimes(1);
  expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual({
    response: "**hello**",
    model: "test-model",
    provider: "test",
  });
  log.mockRestore();
});
