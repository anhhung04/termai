import dbg from "debug";
import { expandContext, ExpandedContext } from "../../context/context";
import { ChatPipelineParameters } from "../ChatPipelineParameters";
import { readProjectInstructions } from "./project-instructions";

const debug = dbg("ai:context");

export async function buildContext(
  params: ChatPipelineParameters,
  env: NodeJS.ProcessEnv,
): Promise<ExpandedContext[]> {
  //  Expand each context prompt, as long as expansion is enabled.
  const context = params.options.enableContextPrompts
    ? params.executionContext.config.prompts.chat.context.map((c) =>
        expandContext(c, env),
      )
    : [];

  const projectInstructions = params.options.enableProjectContext
    ? readProjectInstructions()
    : undefined;
  const expanded = projectInstructions
    ? [...context, projectInstructions]
    : context;

  debug(`expanded context: ${expanded.map((c) => c.context).join("\n")}`);
  return expanded;
}
