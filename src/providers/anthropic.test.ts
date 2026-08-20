import { chatMessagesToAnthropic, chatToolsToAnthropic } from "./anthropic";

describe("Anthropic adapters", () => {
  it("maps system, multimodal messages, and tools", () => {
    expect(
      chatMessagesToAnthropic([
        { role: "system", content: "Be concise" },
        { role: "developer", content: "Use plain language" },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this" },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,AAAA" },
            },
          ],
        },
        { role: "assistant", content: "It is an image." },
      ]),
    ).toEqual({
      system: "Be concise\n\nUse plain language",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this" },
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: "AAAA" },
            },
          ],
        },
        { role: "assistant", content: "It is an image." },
      ],
    });

    expect(
      chatToolsToAnthropic([
        {
          type: "function",
          function: {
            name: "lookup",
            description: "Look something up",
            parameters: {
              type: "object",
              properties: { q: { type: "string" } },
            },
          },
        },
      ]),
    ).toEqual([
      {
        name: "lookup",
        description: "Look something up",
        input_schema: { type: "object", properties: { q: { type: "string" } } },
      },
    ]);
  });
});
