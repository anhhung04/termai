import { execFileSync } from "child_process";
import OpenAI from "openai";

export type ServiceEnumerationArgs = {
  host: string;
};

export const SERVICE_ENUMERATION_TOOL: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: "service_enumeration",
      description:
        "Enumerate common services on a target host using safe built‑in commands. Returns markdown sections for SMB shares, RPC services, and SSH config.",
      parameters: {
        type: "object",
        properties: {
          host: {
            type: "string",
            description: "Target hostname or IP address",
          },
        },
        required: ["host"],
      },
    },
  };

function safeExec(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { encoding: "utf8" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error running ${command}: ${msg}`;
  }
}

export async function executeServiceEnumerationTool(
  args: ServiceEnumerationArgs,
): Promise<string> {
  const { host } = args;

  const smb = safeExec("smbclient", ["-L", host]);
  const rpc = safeExec("rpcinfo", ["-p", host]);
  const ssh = safeExec("ssh", ["-G", host]);

  const markdown = `### SMB shares (smbclient)\n${smb}\n\n### RPC services (rpcinfo)\n${rpc}\n\n### SSH config (ssh -G)\n${ssh}`;
  return markdown;
}
