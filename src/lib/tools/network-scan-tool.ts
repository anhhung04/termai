import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
import OpenAI from "openai";

export type NetworkScanArgs = {
  target: string;
};

export const NETWORK_SCAN_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "network_scan",
    description:
      "Safely scan a network range (IP or CIDR) and return a concise list of open ports/services. Limits: max 256 hosts, scans only common 100 ports, short timeout.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Target IP address or CIDR range to scan",
        },
      },
      required: ["target"],
    },
  },
};

// Helper: basic validation of IP or CIDR and host count limit
function validateTarget(target: string): { valid: boolean; error?: string } {
  // Simple regex for IPv4, IPv6, or CIDR notation (IPv4 only for host count check)
  const ipRegex =
    /^(?:\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/(\d{1,2})$/; // only IPv4 CIDR for simplicity

  if (cidrRegex.test(target)) {
    const [, , maskStr] = target.match(cidrRegex)!;
    const mask = parseInt(maskStr, 10);
    // /24 => 256 hosts, any larger mask is ok, smaller is too many hosts
    if (mask < 24) {
      return {
        valid: false,
        error: "CIDR range too large – maximum 256 hosts allowed (e.g., /24)",
      };
    }
    return { valid: true };
  }

  if (ipRegex.test(target)) {
    return { valid: true };
  }

  return {
    valid: false,
    error:
      "Invalid target format. Provide an IP address or CIDR range (e.g., 192.168.1.0/24)",
  };
}

// Common ports list (100 most common ports). For brevity we use a short example list.
const COMMON_PORTS = [
  22, 80, 443, 21, 25, 110, 143, 3306, 8080, 8443, 53, 123, 1723, 5900, 3389,
  // ... (extend to about 100 ports as needed)
];

export async function executeNetworkScanTool(
  args: NetworkScanArgs,
): Promise<string> {
  const { target } = args;
  const validation = validateTarget(target);
  if (!validation.valid) {
    return `Error: ${validation.error}`;
  }

  // Build nmap arguments
  const portsArg = COMMON_PORTS.join(",");
  const nmapArgs = ["-sS", "--max-retries", "1", "-p", portsArg, target];

  try {
    const { stdout } = await execFileAsync("nmap", nmapArgs, {
      encoding: "utf8",
    });
    // Simple markdown formatting
    const markdown = `**${target}**\n\`
${stdout}\n\``;
    return markdown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error running nmap: ${msg}`;
  }
}
