# Wander

AI-powered browsing companion — a Chrome extension that brings multi-agent AI assistance directly into your browser.

## Features

- **Multi-Agent System** — Configurable agents with custom skills and tools
- **Multi-Provider LLM** — Supports Claude, OpenAI, Gemini, DeepSeek, and Qwen
- **Side Panel UI** — Clean React interface for interacting with agents
- **Tool Execution** — Agents can interact with pages via content scripts

## Getting Started

```bash
npm install
npm run build      # Build to dist/
npm run dev        # Watch mode
```

Load `dist/` as an unpacked extension in Chrome: `chrome://extensions` → Developer mode → Load unpacked.

## Architecture

Three extension contexts communicate via `chrome.runtime.sendMessage`:

| Context | Description |
|---------|-------------|
| **Side Panel** (`src/sidepanel/`) | React UI — renders agent responses, no business logic |
| **Service Worker** (`src/worker/`) | Core engine — orchestrator, agent/skill registries, LLM clients |
| **Content Script** (`src/content/`) | Injected into pages — executes DOM/network tool calls |

## Testing

```bash
npm test           # Run once
npm run test:watch # Watch mode
npx vitest run src/worker/orchestrator.test.ts  # Single file
```
