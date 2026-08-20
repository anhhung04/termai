# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build
npm run build          # Compile TypeScript to dist/
npm run build:watch    # Watch mode

# Development
npm start              # Run via ts-node (no build needed)
npm run relink         # Build + reinstall globally as `ai` binary

# Lint
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix

# Test
npm test               # Run all tests (Jest, no coverage)
npm run test:watch     # Watch mode
npm run test:cov       # With coverage report
npm run tsc            # Type-check only (no emit)

# E2E
make test-e2e          # Shell-based end-to-end tests
```

To run a single test file: `npx jest src/path/to/file.test.ts`

## Architecture

**Entry point:** `src/cli.ts` — Commander.js parses the `ai` binary invocation and routes to commands.

**Commands** (`src/commands/`): `chat`, `init`, `check`, `config`, `debug`. Each is a self-contained module.

**ExecutionContext** (`src/execution-context/`) — Central state object created at startup and threaded through all layers. It holds the resolved configuration, process context (stdin/stdout/TTY detection), and integration handles (Langfuse).

**Chat pipeline** (`src/chat-pipeline/`) — The chat command runs through a sequential pipeline of stages:
1. `ensure-api-key` → `build-context` → `initial-input` → `load-and-append-input-files`
2. `parse-input` → `build-output-intent-context` → `get-response`
3. `parse-response` → `copy-response` → `print-response` → `next-input-or-action`

Two pipeline variants exist: `chat-pipeline-completion-api.ts` (default) and `chat-pipeline-assistant-api.ts` (Assistants API).

**Chat actions** (`src/chat-actions/`) — After each AI response, users get an interactive menu. Actions include `AttachFileAction`, `ChangeModelAction`, `CopyResponseAction`, `ExecuteResponseAction`, `SaveResponseAction`, `FullscreenInputAction`, etc.

**Configuration** (`src/configuration/`) — Loaded from `~/.ai/config.yaml`, merged with env vars (`AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`). Prompts are loaded from `~/.ai/prompts/` as files. See `configuration.ts` for the full schema.

**Provider abstraction** (`src/providers/`) — Multiple AI providers (OpenAI, Gemini, Claude, Ollama, MSTY, LiteLLM) are configured via `providers` key in config. The OpenAI SDK is used as the unified client for all providers (they expose compatible endpoints).

**Output intent** — Users prefix input with `code:` to trigger code-specific output formatting (different system prompt injected via `build-output-intent-context` stage).

**Error codes** (`src/lib/errors.ts`) — Typed error codes (12=InvalidConfiguration, 13=Connection, 15=FileLoadError, etc.) translated to user-friendly messages via `translate-error.ts`.

## Testing

Tests are colocated with source as `*.test.ts` files. Jest uses `ts-jest` with ESM support. `mock-fs` is used for filesystem tests. Custom matchers are declared in `src/types/jest-custom-matchers.d.ts`.

## Key conventions

- TypeScript strict mode; CommonJS output targeting ES2015
- Markdown rendering in terminal uses `marked` + `marked-terminal`
- Interactive prompts use `inquirer` v7 (not v8+; the API differs)
- Debug logging via `debug` package — enable with `DEBUG=ai:*` env var or via config
- Langfuse integration is optional; only activated when configured
