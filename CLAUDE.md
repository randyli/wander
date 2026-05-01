# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Build extension to dist/
npm run dev          # Watch mode (rebuild on changes)
npm test             # Run all tests once
npm run test:watch   # Run tests in watch mode

# Run a single test file
npx vitest run src/worker/orchestrator.test.ts
```

After building, load `dist/` as an unpacked extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked).

## Architecture

Three Chrome extension contexts communicate exclusively via `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` using `{ type: MessageType, requestId: string, payload }` messages (see `src/shared/messages.ts`).

**Side Panel** (`src/sidepanel/`) — React UI. No business logic; sends `MessageType.*` messages to the Service Worker and renders responses.

**Service Worker** (`src/worker/`) — The brain. Hosts `Orchestrator`, `AgentRegistry`, `SkillRegistry`, `EpisodicMemory`, and `KnowledgeStore`. A `chrome.alarms` keepalive fires every ~24s to prevent the 5-minute Service Worker timeout. Entry point is `src/worker/index.ts`, which wires all dependencies together and handles all `chrome.runtime.onMessage` dispatch.

**Content Script** (`src/content/`) — Injected into every page. Executes DOM/network tool calls (see `src/content/tools/`) when it receives `MessageType.TOOL_CALL` from the Service Worker, then returns results.

### Agent & Skill system

Agents and Skills are Markdown files with YAML frontmatter. Built-ins ship in `agents/` and `skills/` and are imported with `?raw` in `src/worker/index.ts`, then seeded into IndexedDB on `onInstalled`. Users can install additional `.md` files at runtime via the Skills/Agents pages in the Side Panel.

- **`AgentRegistry`** / **`SkillRegistry`** — store parsed `AgentDef` / `SkillDef` in IndexedDB.
- **`Orchestrator`** — picks the first registered agent (or a default), resolves its skills into `Tool[]`, instantiates the correct `LLMClient`, and delegates to `AgentRuntime`.
- **`AgentRuntime`** — runs the tool-call loop: chat → parse tool calls → `executeToolCall` → append result → repeat until `end_turn` or max tool calls reached.

### LLM providers

`src/worker/llm/client.ts` exports `getLLMClient(provider, options)` which returns the appropriate client. Provider is inferred from the model name prefix in `Orchestrator` (`gpt-*` → openai, `gemini-*` → gemini, `deepseek-*` → deepseek, `qwen-*` → qwen, else claude).

### Storage

| Data | Location |
|------|----------|
| API keys | `chrome.storage.local` keyed as `apiKey_<provider>` |
| Global config | `chrome.storage.local` under key `config` |
| Agents, Skills, Episodes, Knowledge | IndexedDB (one store per type) |

### Path alias

`@shared` resolves to `src/shared/` in both Vite and Vitest configs.

### Testing

Tests use Vitest + jsdom. `src/test-setup.ts` stubs the global `chrome` API (runtime, tabs, storage, alarms, sidePanel). IndexedDB is provided by `fake-indexeddb`.
