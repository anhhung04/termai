import axios from "axios";
import OpenAI from "openai";

export type FetchPageArgs = {
  url: string;
};

export const FETCH_PAGE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "fetch_page",
    description:
      "Fetch a web page and return its content as clean markdown, stripping navigation, ads, and boilerplate. Use this to read documentation, blog posts, articles, GitHub READMEs, or any URL returned by search_web. Always prefer fetching a page over guessing at its content.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL of the page to fetch",
        },
      },
      required: ["url"],
    },
  },
};

const MAX_CONTENT_CHARS = 8000;
const REQUEST_TIMEOUT_MS = 15000;

//  defuddle/node is ESM-only in the exports map, so we use a dynamic import
//  to load it at runtime. This works in Node.js CJS context and TypeScript
//  correctly resolves types for the `defuddle/node` exports map entry.
async function loadDefuddle() {
  const mod = await import("defuddle/node");
  return mod.Defuddle;
}

export async function executeFetchPageTool(
  args: FetchPageArgs,
): Promise<string> {
  let html: string;
  try {
    const response = await axios.get<string>(args.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
        Accept: "text/html,application/xhtml+xml",
      },
      timeout: REQUEST_TIMEOUT_MS,
      responseType: "text",
      maxContentLength: 5 * 1024 * 1024, // 5 MB cap
    });
    html = response.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Failed to fetch page: ${msg}`;
  }

  let content: string;
  try {
    const Defuddle = await loadDefuddle();
    const result = await Defuddle(html, args.url, { markdown: true });
    content = result.content?.trim() ?? "";
    if (!content) {
      return "Page fetched but no readable content could be extracted.";
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Failed to parse page content: ${msg}`;
  }

  if (content.length > MAX_CONTENT_CHARS) {
    return content.slice(0, MAX_CONTENT_CHARS) + "\n\n[content truncated]";
  }
  return content;
}
