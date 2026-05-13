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

## Local Development Commands

```bash
npm run typecheck      # TypeScript check with tsc --noEmit
npm run lint           # Static validation (currently delegates to typecheck)
npm test               # Run unit tests once
npm run test:watch     # Run unit tests in watch mode
npm run test:coverage  # Run unit tests with V8 coverage
npm run build          # Produce the unpacked extension in dist/
npm run e2e            # Build and run Chrome extension e2e smoke tests
```

The e2e script launches Chrome/Chromium with `dist/` loaded, verifies the extension manifest, exercises the side panel open path, sends a message to the content script, and asserts that a DOM tool call returns fixture page text. If Chrome is not in a standard location, set `CHROME_PATH=/path/to/chrome` before running `npm run e2e`.

## Loading the Extension Locally

1. Run `npm run build`.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the generated `dist/` directory.
5. Pin or click the Wander extension action to open the side panel.
6. Configure provider API keys and default model in the settings page before issuing agent tasks.

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

Before opening a PR or publishing, run:

```bash
npm run typecheck
npm test
npm run test:coverage
npm run build
```

Run `npm run e2e` when Chrome/Chromium is available to validate the packaged extension in a real browser context.

## Release / Publishing Checklist

- [ ] `npm ci` completes on a clean checkout.
- [ ] `npm run typecheck`, `npm test`, and `npm run build` pass locally and in CI.
- [ ] `npm run test:coverage` is reviewed for meaningful coverage of changed code.
- [ ] `npm run e2e` passes against the built `dist/` extension in Chrome/Chromium.
- [ ] Load `dist/` manually and verify side panel startup, settings, provider configuration, and representative tool calls.
- [ ] Confirm `manifest.json` version, permissions, host permissions, and extension description are correct for the release.
- [ ] Remove local secrets, test agents, and development-only artifacts from the package.
- [ ] Prepare store listing notes, screenshots, and privacy disclosures before uploading the release artifact.
