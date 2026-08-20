import axios from "axios";
import { JSDOM } from "jsdom";
import OpenAI from "openai";

export type SearchWebArgs = {
  query: string;
  max_results?: number;
};

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export const SEARCH_WEB_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_web",
    description:
      "Search the web via DuckDuckGo to find current information, documentation, tutorials, or recent news. Use this proactively when the user asks about something that might have changed recently, needs up-to-date syntax, or references a specific tool/library/service.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
        max_results: {
          type: "number",
          description:
            "Maximum number of results to return (default 5, max 10)",
        },
      },
      required: ["query"],
    },
  },
};

const DDG_URL = "https://html.duckduckgo.com/html/";
const MAX_RESULTS_CAP = 10;
const REQUEST_TIMEOUT_MS = 10000;

//  Standard browser-like headers — DDG blocks or degrades responses without a
//  realistic User-Agent. POST to the HTML endpoint is more reliable than GET.
const DDG_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

function extractUrlFromHref(href: string): string {
  try {
    //  DDG wraps result URLs in a redirect like /l/?uddg=<encoded-url>
    const base = href.startsWith("/") ? `https://duckduckgo.com${href}` : href;
    const urlObj = new URL(base);
    const uddg = urlObj.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : href;
  } catch {
    return href;
  }
}

export async function executeSearchWebTool(
  args: SearchWebArgs,
): Promise<string> {
  const maxResults = Math.min(args.max_results ?? 5, MAX_RESULTS_CAP);

  let html: string;
  try {
    const response = await axios.post<string>(
      DDG_URL,
      new URLSearchParams({ q: args.query }).toString(),
      {
        headers: DDG_HEADERS,
        timeout: REQUEST_TIMEOUT_MS,
        responseType: "text",
      },
    );
    html = response.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Search failed: ${msg}`;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;
  const results: SearchResult[] = [];

  for (const el of Array.from(document.querySelectorAll(".result"))) {
    if (results.length >= maxResults) break;

    const titleEl = el.querySelector(".result__a");
    const snippetEl = el.querySelector(".result__snippet");
    if (!titleEl) continue;

    const title = titleEl.textContent?.trim() ?? "";
    const href = titleEl.getAttribute("href") ?? "";
    const snippet = snippetEl?.textContent?.trim() ?? "";
    const url = extractUrlFromHref(href);

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  if (results.length === 0) {
    return "No search results found.";
  }

  return results
    .map(
      (r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`,
    )
    .join("\n\n");
}
