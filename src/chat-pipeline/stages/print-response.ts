import { ChatPipelineParameters } from "../ChatPipelineParameters";
import { OutputIntent } from "./parse-input";
import { ChatResponse } from "./parse-response";

export async function printResponse(
  params: ChatPipelineParameters,
  response: ChatResponse,
  outputIntent: OutputIntent,
) {
  if (params.options.format === "json") {
    console.log(
      JSON.stringify({
        response: response.rawMarkdownResponse,
        model: params.executionContext.provider.model,
        provider: params.executionContext.provider.name,
      }),
    );
    return;
  }

  //  If we are writing raw markdown, dump it now and we're done.
  if (params.options.raw || params.options.format === "markdown") {
    console.log(response.rawMarkdownResponse);
    return;
  }

  //  If our output intent is code, then we will write the code block only and
  //  format based on whether we have an output TTY.
  if (outputIntent === OutputIntent.Code) {
    if (params.executionContext.isTTYstdout) {
      console.log(response.codeBlocks[0]?.colourFormattedCode);
    } else {
      console.log(response.codeBlocks[0]?.plainTextCode);
    }
    return;
  }

  //  Finally, write the response. If we have a TTY it'll be coloured, otherwise
  //  it'll be formatted as plain text.
  if (params.executionContext.isTTYstdout) {
    console.log(response.colourFormattedResponseWithPrompt);
  } else {
    console.log(response.plainTextFormattedResponse);
  }
}
