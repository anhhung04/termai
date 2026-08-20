import {
  chatMessagesToResponsesInput,
  chatToolsToResponsesTools,
} from "./responses";

describe("Responses API adapters", () => {
  it("converts chat messages and function tools", () => {
    expect(
      chatMessagesToResponsesInput([
        { role: "system", content: "Be concise" },
        { role: "assistant", content: "An earlier answer" },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this" },
            {
              type: "image_url",
              image_url: { url: "https://example.com/a.png" },
            },
          ],
        },
      ]),
    ).toEqual([
      { role: "system", content: "Be concise" },
      {
        role: "user",
        content: "Previous assistant response:\nAn earlier answer",
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: "Describe this" },
          { type: "input_image", image_url: "https://example.com/a.png" },
        ],
      },
    ]);

    expect(
      chatToolsToResponsesTools([
        {
          type: "function",
          function: {
            name: "lookup",
            description: "Look something up",
            parameters: { type: "object" },
          },
        },
      ]),
    ).toEqual([
      {
        type: "function",
        name: "lookup",
        description: "Look something up",
        parameters: { type: "object" },
        strict: false,
      },
    ]);
  });
});
