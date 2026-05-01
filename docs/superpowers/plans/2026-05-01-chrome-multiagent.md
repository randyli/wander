# Chrome Multi-Agent Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome Extension (MV3) with a multi-agent framework: Markdown-defined agents/skills, three-layer memory, full browser tool access, cloud LLM backends, and a React side panel.

**Architecture:** Three-layer Chrome Extension — React Side Panel (UI) ↔ Service Worker (Orchestrator + Agent Runtime + Memory + LLM) ↔ Content Script (Browser Tools). All communication via `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` using `{ type, payload, requestId }` protocol. Agents and Skills defined as Markdown with YAML frontmatter, parsed by gray-matter.

**Tech Stack:** TypeScript 5, React 18, Vite 5, Vitest 2, @crxjs/vite-plugin, Chrome Manifest V3, IndexedDB, gray-matter, @anthropic-ai/sdk, openai, @google/generative-ai.

---

## File Map

```
src/
  shared/
    types.ts            – All shared interfaces: AgentDef, SkillDef, LLMMessage, Tool, ToolCall,
                          LLMResponse, WorkingMemory, Episode, KnowledgeEntry, GlobalConfig, TaskState
    messages.ts         – MessageType enum + typed request/response shapes + type guards
  content/
    index.ts            – Entry: registers chrome.runtime.onMessage, routes TOOL_CALL to tool implementations
    tools/
      dom.ts            – domGetText, domGetHTML, domClick, domFill, domSubmit, domWaitFor
      page.ts           – pageScroll (screenshot handled in service worker)
      nav.ts            – navBack, navForward, navGoto
      net.ts            – netFetch
  worker/
    index.ts            – Service worker entry: keepalive via chrome.alarms, message router, lazy init
    markdown-parser.ts  – parseAgentMarkdown, parseSkillMarkdown (gray-matter + typed output)
    skill-registry.ts   – IndexedDB `multiagent-skills` store: install, get, list, delete SkillDef
    agent-registry.ts   – IndexedDB `multiagent-agents` store: install, get, list, delete AgentDef
    agent-runtime.ts    – Execute one agent: system prompt + skills → LLM loop with tool calls
    orchestrator.ts     – Select agent, instantiate LLMClient, dispatch to AgentRuntime
    memory/
      working.ts        – In-memory Map<taskId, WorkingMemory>: init, getContext, appendMessage, logToolCall, clear
      episodic.ts       – IndexedDB `multiagent-episodes`: save, search, list, delete Episode
      knowledge.ts      – IndexedDB `multiagent-knowledge`: set, get, searchByTag, list, delete KnowledgeEntry
    llm/
      client.ts         – LLMClient interface + getLLMClient(provider, options) factory
      claude.ts         – ClaudeClient: maps LLMMessage[] + Tool[] → Anthropic SDK → LLMResponse
      openai.ts         – OpenAIClient: maps to OpenAI SDK
      gemini.ts         – GeminiClient: maps to Google Generative AI SDK
  sidepanel/
    sidepanel.html      – HTML entry for side panel
    main.tsx            – React root mount
    App.tsx             – Tab nav: Chat | Skills | Memory | Settings
    components/
      ChatPanel.tsx     – Conversation + input; sends USER_MESSAGE to worker, shows streaming bubbles
      MessageBubble.tsx – Single message (user/assistant), inline styles
      FileDropZone.tsx  – Drag-and-drop .md installer
    pages/
      SkillsPage.tsx    – List/install/delete skills via FileDropZone
      MemoryPage.tsx    – Tab between episodic + knowledge; delete entries
      SettingsPage.tsx  – API key inputs per provider + global config
agents/
  orchestrator.md       – Built-in orchestrator agent
skills/
  read-page.md | take-screenshot.md | navigate.md | fill-form.md | memory-read.md | memory-write.md
manifest.json | vite.config.ts | tsconfig.json | vitest.config.ts | package.json
src/test-setup.ts       – Vitest global chrome API mock
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/test-setup.ts`
- Create: `manifest.json`
- Create: `src/sidepanel/sidepanel.html`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "chrome-multiagent",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "@google/generative-ai": "^0.21.0",
    "gray-matter": "^4.0.3",
    "openai": "^4.67.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.26",
    "@types/chrome": "^0.0.270",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "@vitest/coverage-v8": "^2.1.8",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src", "agents", "skills"]
}
```

- [ ] **Step 4: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Multi-Agent Framework",
  "version": "0.1.0",
  "description": "Chrome extension multi-agent framework",
  "permissions": ["activeTab", "scripting", "storage", "alarms", "sidePanel", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "src/worker/index.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/index.ts"]
    }
  ],
  "side_panel": {
    "default_path": "src/sidepanel/sidepanel.html"
  },
  "action": {
    "default_title": "Open Agent Panel"
  }
}
```

- [ ] **Step 5: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: { '@shared': '/src/shared' },
  },
})
```

- [ ] **Step 6: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    coverage: { provider: 'v8' },
  },
  resolve: {
    alias: { '@shared': '/src/shared' },
  },
})
```

- [ ] **Step 7: Create src/test-setup.ts**

```typescript
const chromeMock = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    id: 'test-extension-id',
    lastError: undefined as chrome.runtime.LastError | undefined,
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn(),
    create: vi.fn(),
    captureVisibleTab: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
  alarms: {
    create: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  sidePanel: { open: vi.fn() },
}

vi.stubGlobal('chrome', chromeMock)
```

- [ ] **Step 8: Create src/sidepanel/sidepanel.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Panel</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: system-ui, sans-serif; height: 100vh; overflow: hidden; }
      #root { height: 100%; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: `dist/` directory created without TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding — Vite+React+TS Chrome extension setup"
```

---

### Task 2: Shared Types & Message Protocol

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/messages.ts`
- Create: `src/shared/messages.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/shared/messages.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isToolCallMessage, isUserMessage, MessageType } from './messages'

describe('message type guards', () => {
  it('identifies TOOL_CALL message', () => {
    const msg = { type: MessageType.TOOL_CALL, payload: { tool: 'dom.getText', params: {} }, requestId: '1' }
    expect(isToolCallMessage(msg)).toBe(true)
  })

  it('rejects USER_MESSAGE as TOOL_CALL', () => {
    const msg = { type: MessageType.USER_MESSAGE, payload: { text: 'hello' }, requestId: '1' }
    expect(isToolCallMessage(msg)).toBe(false)
  })

  it('identifies USER_MESSAGE', () => {
    const msg = { type: MessageType.USER_MESSAGE, payload: { text: 'hello' }, requestId: '1' }
    expect(isUserMessage(msg)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/shared/messages.test.ts`
Expected: FAIL — `Cannot find module './messages'`

- [ ] **Step 3: Create src/shared/types.ts**

```typescript
export type LLMProvider = 'claude' | 'openai' | 'gemini'
export type Role = 'user' | 'assistant' | 'tool'

export interface LLMMessage {
  role: Role
  content: string
  toolCallId?: string
  toolName?: string
}

export interface ToolParameter {
  type: string
  description?: string
}

export interface Tool {
  name: string
  description: string
  parameters: Record<string, ToolParameter>
}

export interface ToolCall {
  id: string
  name: string
  params: Record<string, unknown>
}

export interface LLMResponse {
  content: string
  toolCalls: ToolCall[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
}

export interface AgentDef {
  name: string
  description: string
  skills: string[]
  llm: string
  systemPrompt: string
}

export interface SkillDef {
  name: string
  description: string
  tool: string
  parameters: Record<string, string>
  instructions: string
}

export interface WorkingMemory {
  taskId: string
  messages: LLMMessage[]
  toolCallLog: Array<{ tool: string; params: unknown; result: unknown; ts: number }>
}

export interface Episode {
  id: string
  summary: string
  domain: string
  tags: string[]
  createdAt: number
}

export interface KnowledgeEntry {
  key: string
  value: string
  tags: string[]
  updatedAt: number
}

export interface GlobalConfig {
  defaultProvider: LLMProvider
  defaultModel: string
  maxToolCallsPerTask: number
  maxEpisodes: number
}

export interface TaskState {
  taskId: string
  status: 'pending' | 'running' | 'done' | 'error'
  result?: string
  error?: string
}
```

- [ ] **Step 4: Create src/shared/messages.ts**

```typescript
export enum MessageType {
  USER_MESSAGE = 'USER_MESSAGE',
  LIST_AGENTS = 'LIST_AGENTS',
  INSTALL_AGENT = 'INSTALL_AGENT',
  DELETE_AGENT = 'DELETE_AGENT',
  LIST_SKILLS = 'LIST_SKILLS',
  INSTALL_SKILL = 'INSTALL_SKILL',
  DELETE_SKILL = 'DELETE_SKILL',
  LIST_EPISODES = 'LIST_EPISODES',
  DELETE_EPISODE = 'DELETE_EPISODE',
  LIST_KNOWLEDGE = 'LIST_KNOWLEDGE',
  DELETE_KNOWLEDGE = 'DELETE_KNOWLEDGE',
  GET_CONFIG = 'GET_CONFIG',
  SET_CONFIG = 'SET_CONFIG',
  SET_API_KEY = 'SET_API_KEY',
  AGENT_MESSAGE = 'AGENT_MESSAGE',
  TASK_STATUS = 'TASK_STATUS',
  RESPONSE = 'RESPONSE',
  TOOL_CALL = 'TOOL_CALL',
  TOOL_RESULT = 'TOOL_RESULT',
}

export interface BaseMessage {
  type: MessageType
  requestId: string
}

export interface UserMessage extends BaseMessage {
  type: MessageType.USER_MESSAGE
  payload: { text: string }
}

export interface AgentMessage extends BaseMessage {
  type: MessageType.AGENT_MESSAGE
  payload: { text: string; agentName: string }
}

export interface ToolCallMessage extends BaseMessage {
  type: MessageType.TOOL_CALL
  payload: { tool: string; params: Record<string, unknown> }
}

export interface ToolResultMessage extends BaseMessage {
  type: MessageType.TOOL_RESULT
  payload: { result: unknown; error?: string }
}

export interface ResponseMessage extends BaseMessage {
  type: MessageType.RESPONSE
  payload: unknown
}

export type ChromeMessage =
  | UserMessage | AgentMessage | ToolCallMessage | ToolResultMessage | ResponseMessage

export function isToolCallMessage(msg: unknown): msg is ToolCallMessage {
  return (msg as BaseMessage)?.type === MessageType.TOOL_CALL
}

export function isUserMessage(msg: unknown): msg is UserMessage {
  return (msg as BaseMessage)?.type === MessageType.USER_MESSAGE
}

export function isToolResultMessage(msg: unknown): msg is ToolResultMessage {
  return (msg as BaseMessage)?.type === MessageType.TOOL_RESULT
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/shared/messages.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/
git commit -m "feat: shared types and message protocol"
```

---

### Task 3: Markdown Parser

**Files:**
- Create: `src/worker/markdown-parser.ts`
- Create: `src/worker/markdown-parser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/worker/markdown-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseAgentMarkdown, parseSkillMarkdown } from './markdown-parser'

const agentMd = `---
name: web-researcher
type: agent
description: Researches web pages
skills:
  - read-page
  - take-screenshot
llm: claude-opus-4-7
---

You are a web researcher. When given a research task, browse and summarize.`

const skillMd = `---
name: read-page
type: skill
description: Read current page text
tool: dom.getText
parameters:
  selector: string
---

Call this skill to get visible text from the page.`

describe('parseAgentMarkdown', () => {
  it('parses name and description', () => {
    const agent = parseAgentMarkdown(agentMd)
    expect(agent.name).toBe('web-researcher')
    expect(agent.description).toBe('Researches web pages')
  })

  it('parses skills list', () => {
    const agent = parseAgentMarkdown(agentMd)
    expect(agent.skills).toEqual(['read-page', 'take-screenshot'])
  })

  it('parses llm and system prompt', () => {
    const agent = parseAgentMarkdown(agentMd)
    expect(agent.llm).toBe('claude-opus-4-7')
    expect(agent.systemPrompt).toContain('web researcher')
  })
})

describe('parseSkillMarkdown', () => {
  it('parses name and tool', () => {
    const skill = parseSkillMarkdown(skillMd)
    expect(skill.name).toBe('read-page')
    expect(skill.tool).toBe('dom.getText')
  })

  it('parses parameters', () => {
    const skill = parseSkillMarkdown(skillMd)
    expect(skill.parameters).toEqual({ selector: 'string' })
  })

  it('parses instructions from body', () => {
    const skill = parseSkillMarkdown(skillMd)
    expect(skill.instructions).toContain('visible text')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/worker/markdown-parser.test.ts`
Expected: FAIL — `Cannot find module './markdown-parser'`

- [ ] **Step 3: Create src/worker/markdown-parser.ts**

```typescript
import matter from 'gray-matter'
import type { AgentDef, SkillDef } from '@shared/types'

export function parseAgentMarkdown(markdown: string): AgentDef {
  const { data, content } = matter(markdown)
  return {
    name: String(data.name),
    description: String(data.description ?? ''),
    skills: Array.isArray(data.skills) ? data.skills.map(String) : [],
    llm: String(data.llm ?? 'claude-opus-4-7'),
    systemPrompt: content.trim(),
  }
}

export function parseSkillMarkdown(markdown: string): SkillDef {
  const { data, content } = matter(markdown)
  const parameters: Record<string, string> = {}
  if (data.parameters && typeof data.parameters === 'object') {
    for (const [k, v] of Object.entries(data.parameters)) {
      parameters[k] = String(v)
    }
  }
  return {
    name: String(data.name),
    description: String(data.description ?? ''),
    tool: String(data.tool ?? ''),
    parameters,
    instructions: content.trim(),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/worker/markdown-parser.test.ts`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/worker/markdown-parser.ts src/worker/markdown-parser.test.ts
git commit -m "feat: markdown parser for agent and skill definitions"
```

---

### Task 4: Content Script — DOM Tools

**Files:**
- Create: `src/content/tools/dom.ts`
- Create: `src/content/tools/dom.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/content/tools/dom.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { domGetText, domGetHTML, domClick, domFill, domSubmit, domWaitFor } from './dom'

describe('domGetText', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="main"><p class="content">Hello world</p></div>'
  })

  it('returns full body text when no selector', () => {
    expect(domGetText({})).toContain('Hello world')
  })

  it('returns text for selector', () => {
    expect(domGetText({ selector: '.content' })).toBe('Hello world')
  })

  it('throws when selector not found', () => {
    expect(() => domGetText({ selector: '#missing' })).toThrow('Element not found')
  })
})

describe('domGetHTML', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="box"><span>Hi</span></div>'
  })

  it('returns innerHTML of matched element', () => {
    expect(domGetHTML({ selector: '#box' })).toBe('<span>Hi</span>')
  })
})

describe('domClick', () => {
  it('clicks the element', () => {
    let clicked = false
    document.body.innerHTML = '<button id="btn">Click</button>'
    document.getElementById('btn')!.addEventListener('click', () => { clicked = true })
    domClick({ selector: '#btn' })
    expect(clicked).toBe(true)
  })
})

describe('domFill', () => {
  it('fills input value and fires input event', () => {
    document.body.innerHTML = '<input id="name" type="text" />'
    const input = document.getElementById('name') as HTMLInputElement
    let fired = false
    input.addEventListener('input', () => { fired = true })
    domFill({ selector: '#name', value: 'Alice' })
    expect(input.value).toBe('Alice')
    expect(fired).toBe(true)
  })
})

describe('domSubmit', () => {
  it('submits form', () => {
    document.body.innerHTML = '<form id="f"><input name="q" /></form>'
    let submitted = false
    document.getElementById('f')!.addEventListener('submit', (e) => {
      e.preventDefault()
      submitted = true
    })
    domSubmit({ selector: '#f' })
    expect(submitted).toBe(true)
  })
})

describe('domWaitFor', () => {
  it('resolves when element exists immediately', async () => {
    document.body.innerHTML = '<div id="ready"></div>'
    await expect(domWaitFor({ selector: '#ready', timeout: 100 })).resolves.toBeUndefined()
  })

  it('rejects when element does not appear within timeout', async () => {
    document.body.innerHTML = ''
    await expect(domWaitFor({ selector: '#missing', timeout: 50 })).rejects.toThrow('Timeout')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/content/tools/dom.test.ts`
Expected: FAIL — `Cannot find module './dom'`

- [ ] **Step 3: Create src/content/tools/dom.ts**

```typescript
export function domGetText({ selector }: { selector?: string }): string {
  if (!selector) return document.body.innerText
  const el = document.querySelector(selector)
  if (!el) throw new Error(`Element not found: ${selector}`)
  return (el as HTMLElement).innerText
}

export function domGetHTML({ selector }: { selector: string }): string {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`Element not found: ${selector}`)
  return el.innerHTML
}

export function domClick({ selector }: { selector: string }): void {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`Element not found: ${selector}`)
  ;(el as HTMLElement).click()
}

export function domFill({ selector, value }: { selector: string; value: string }): void {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`Element not found: ${selector}`)
  const input = el as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

export function domSubmit({ selector }: { selector?: string }): void {
  const el = selector ? document.querySelector(selector) : document.querySelector('form')
  if (!el) throw new Error(`Form not found${selector ? `: ${selector}` : ''}`)
  ;(el as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

export function domWaitFor({ selector, timeout }: { selector: string; timeout: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) { resolve(); return }
    const deadline = Date.now() + timeout
    const interval = setInterval(() => {
      if (document.querySelector(selector)) {
        clearInterval(interval)
        resolve()
      } else if (Date.now() >= deadline) {
        clearInterval(interval)
        reject(new Error(`Timeout waiting for: ${selector}`))
      }
    }, 50)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/content/tools/dom.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/content/tools/dom.ts src/content/tools/dom.test.ts
git commit -m "feat: content script DOM tools"
```

---

### Task 5: Content Script — Page, Nav & Network Tools

**Files:**
- Create: `src/content/tools/page.ts`
- Create: `src/content/tools/page.test.ts`
- Create: `src/content/tools/nav.ts`
- Create: `src/content/tools/nav.test.ts`
- Create: `src/content/tools/net.ts`
- Create: `src/content/tools/net.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/content/tools/page.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { pageScroll } from './page'

describe('pageScroll', () => {
  it('calls window.scrollBy with given coordinates', () => {
    const spy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    pageScroll({ x: 0, y: 300 })
    expect(spy).toHaveBeenCalledWith(0, 300)
  })
})
```

Create `src/content/tools/nav.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { navBack, navForward } from './nav'

describe('navBack', () => {
  it('calls history.back', () => {
    const spy = vi.spyOn(history, 'back').mockImplementation(() => {})
    navBack()
    expect(spy).toHaveBeenCalled()
  })
})

describe('navForward', () => {
  it('calls history.forward', () => {
    const spy = vi.spyOn(history, 'forward').mockImplementation(() => {})
    navForward()
    expect(spy).toHaveBeenCalled()
  })
})
```

Create `src/content/tools/net.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { netFetch } from './net'

describe('netFetch', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('calls fetch and returns structured result', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200, text: async () => '{"data":1}',
    } as Response)
    const result = await netFetch({ url: 'https://example.com/api' })
    expect(fetch).toHaveBeenCalledWith('https://example.com/api', {})
    expect(result).toEqual({ ok: true, status: 200, body: '{"data":1}' })
  })

  it('returns error info on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false, status: 404, text: async () => 'Not Found',
    } as Response)
    const result = await netFetch({ url: 'https://example.com/missing' })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/content/tools/page.test.ts src/content/tools/nav.test.ts src/content/tools/net.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create src/content/tools/page.ts**

```typescript
export function pageScroll({ x, y }: { x: number; y: number }): void {
  window.scrollBy(x, y)
}
```

Note: `page.screenshot` is handled in the service worker via `chrome.tabs.captureVisibleTab`, not in the content script.

- [ ] **Step 4: Create src/content/tools/nav.ts**

```typescript
export function navBack(): void { history.back() }
export function navForward(): void { history.forward() }
export function navGoto({ url }: { url: string }): void { window.location.href = url }
```

Note: `nav.newTab` requires `chrome.tabs.create` and is handled in the service worker.

- [ ] **Step 5: Create src/content/tools/net.ts**

```typescript
export interface FetchResult {
  ok: boolean
  status: number
  body: string
}

export async function netFetch({
  url,
  options = {},
}: {
  url: string
  options?: RequestInit
}): Promise<FetchResult> {
  const response = await fetch(url, options)
  const body = await response.text()
  return { ok: response.ok, status: response.status, body }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/content/tools/page.test.ts src/content/tools/nav.test.ts src/content/tools/net.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/content/tools/
git commit -m "feat: content script page, nav, and network tools"
```

---

### Task 6: Content Script Entry Point

**Files:**
- Create: `src/content/index.ts`
- Create: `src/content/index.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/content/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleToolCall } from './index'

describe('handleToolCall', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="para">Test content</p>'
  })

  it('routes dom.getText to domGetText', async () => {
    const result = await handleToolCall('dom.getText', { selector: '#para' })
    expect(result).toBe('Test content')
  })

  it('routes dom.click and returns undefined', async () => {
    document.body.innerHTML = '<button id="btn">Click me</button>'
    let clicked = false
    document.getElementById('btn')!.addEventListener('click', () => { clicked = true })
    await handleToolCall('dom.click', { selector: '#btn' })
    expect(clicked).toBe(true)
  })

  it('throws on unknown tool', async () => {
    await expect(handleToolCall('unknown.tool', {})).rejects.toThrow('Unknown tool')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/content/index.test.ts`
Expected: FAIL — `Cannot find module './index'` or named export error.

- [ ] **Step 3: Create src/content/index.ts**

```typescript
import { MessageType, isToolCallMessage } from '@shared/messages'
import { domGetText, domGetHTML, domClick, domFill, domSubmit, domWaitFor } from './tools/dom'
import { pageScroll } from './tools/page'
import { navBack, navForward, navGoto } from './tools/nav'
import { netFetch } from './tools/net'

export async function handleToolCall(tool: string, params: Record<string, unknown>): Promise<unknown> {
  switch (tool) {
    case 'dom.getText':  return domGetText(params as { selector?: string })
    case 'dom.getHTML':  return domGetHTML(params as { selector: string })
    case 'dom.click':    return domClick(params as { selector: string })
    case 'dom.fill':     return domFill(params as { selector: string; value: string })
    case 'dom.submit':   return domSubmit(params as { selector?: string })
    case 'dom.waitFor':  return domWaitFor(params as { selector: string; timeout: number })
    case 'page.scroll':  return pageScroll(params as { x: number; y: number })
    case 'nav.goto':     return navGoto(params as { url: string })
    case 'nav.back':     return navBack()
    case 'nav.forward':  return navForward()
    case 'net.fetch':    return netFetch(params as { url: string; options?: RequestInit })
    default:             throw new Error(`Unknown tool: ${tool}`)
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isToolCallMessage(message)) return false
  handleToolCall(message.payload.tool, message.payload.params)
    .then(result => sendResponse({ type: MessageType.TOOL_RESULT, requestId: message.requestId, payload: { result } }))
    .catch(error => sendResponse({ type: MessageType.TOOL_RESULT, requestId: message.requestId, payload: { result: null, error: String(error) } }))
  return true
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/content/index.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/content/index.ts src/content/index.test.ts
git commit -m "feat: content script entry point and tool router"
```

---

### Task 7: LLM Client — Interface & Claude

**Files:**
- Create: `src/worker/llm/client.ts`
- Create: `src/worker/llm/claude.ts`
- Create: `src/worker/llm/claude.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/worker/llm/claude.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ClaudeClient } from './claude'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Hello from Claude' }],
        stop_reason: 'end_turn',
      }),
    },
  })),
}))

describe('ClaudeClient', () => {
  let client: ClaudeClient

  beforeEach(() => {
    client = new ClaudeClient({ apiKey: 'test-key', model: 'claude-opus-4-7' })
  })

  it('returns text response', async () => {
    const response = await client.chat([{ role: 'user', content: 'Hello' }])
    expect(response.content).toBe('Hello from Claude')
    expect(response.stopReason).toBe('end_turn')
    expect(response.toolCalls).toEqual([])
  })

  it('parses tool_use response', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'tool_use', id: 'call_1', name: 'dom.getText', input: { selector: '#main' } }],
          stop_reason: 'tool_use',
        }),
      },
    }) as never)
    const c = new ClaudeClient({ apiKey: 'key', model: 'claude-opus-4-7' })
    const response = await c.chat([{ role: 'user', content: 'Get text' }])
    expect(response.toolCalls).toHaveLength(1)
    expect(response.toolCalls[0].name).toBe('dom.getText')
    expect(response.stopReason).toBe('tool_use')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/worker/llm/claude.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create src/worker/llm/client.ts**

```typescript
import type { LLMMessage, Tool, LLMResponse } from '@shared/types'

export interface LLMClientOptions {
  apiKey: string
  model: string
}

export interface LLMClient {
  chat(messages: LLMMessage[], tools?: Tool[]): Promise<LLMResponse>
}

export function getLLMClient(provider: string, options: LLMClientOptions): LLMClient {
  if (provider === 'claude') {
    const { ClaudeClient } = require('./claude') as typeof import('./claude')
    return new ClaudeClient(options)
  }
  if (provider === 'openai') {
    const { OpenAIClient } = require('./openai') as typeof import('./openai')
    return new OpenAIClient(options)
  }
  if (provider === 'gemini') {
    const { GeminiClient } = require('./gemini') as typeof import('./gemini')
    return new GeminiClient(options)
  }
  throw new Error(`Unknown LLM provider: ${provider}`)
}
```

- [ ] **Step 4: Create src/worker/llm/claude.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { LLMMessage, Tool, LLMResponse, ToolCall } from '@shared/types'
import type { LLMClient, LLMClientOptions } from './client'

export class ClaudeClient implements LLMClient {
  private anthropic: Anthropic
  private model: string

  constructor({ apiKey, model }: LLMClientOptions) {
    this.anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
    this.model = model
  }

  async chat(messages: LLMMessage[], tools: Tool[] = []): Promise<LLMResponse> {
    const anthropicMessages = messages.map(m => ({
      role: m.role === 'tool' ? ('user' as const) : (m.role as 'user' | 'assistant'),
      content: m.role === 'tool'
        ? [{ type: 'tool_result' as const, tool_use_id: m.toolCallId!, content: m.content }]
        : m.content,
    }))

    const anthropicTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
        ),
      },
    }))

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: anthropicMessages,
      ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
    })

    const toolCalls: ToolCall[] = response.content
      .filter(b => b.type === 'tool_use')
      .map(b => {
        const tb = b as { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        return { id: tb.id, name: tb.name, params: tb.input }
      })

    const textBlock = response.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined
    return {
      content: textBlock?.text ?? '',
      toolCalls,
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use'
        : response.stop_reason === 'max_tokens' ? 'max_tokens'
        : 'end_turn',
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/worker/llm/claude.test.ts`
Expected: PASS — 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/worker/llm/
git commit -m "feat: LLM client interface and Claude implementation"
```

---

### Task 8: LLM Client — OpenAI & Gemini

**Files:**
- Create: `src/worker/llm/openai.ts`
- Create: `src/worker/llm/openai.test.ts`
- Create: `src/worker/llm/gemini.ts`
- Create: `src/worker/llm/gemini.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/worker/llm/openai.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { OpenAIClient } from './openai'

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: { role: 'assistant', content: 'Hello from OpenAI', tool_calls: null },
            finish_reason: 'stop',
          }],
        }),
      },
    },
  })),
}))

describe('OpenAIClient', () => {
  it('returns text response', async () => {
    const client = new OpenAIClient({ apiKey: 'test', model: 'gpt-4o' })
    const response = await client.chat([{ role: 'user', content: 'Hi' }])
    expect(response.content).toBe('Hello from OpenAI')
    expect(response.toolCalls).toEqual([])
    expect(response.stopReason).toBe('end_turn')
  })
})
```

Create `src/worker/llm/gemini.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { GeminiClient } from './gemini'

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => 'Hello from Gemini',
          functionCalls: () => [],
        },
      }),
    }),
  })),
}))

describe('GeminiClient', () => {
  it('returns text response', async () => {
    const client = new GeminiClient({ apiKey: 'test', model: 'gemini-1.5-pro' })
    const response = await client.chat([{ role: 'user', content: 'Hi' }])
    expect(response.content).toBe('Hello from Gemini')
    expect(response.toolCalls).toEqual([])
    expect(response.stopReason).toBe('end_turn')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/worker/llm/openai.test.ts src/worker/llm/gemini.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create src/worker/llm/openai.ts**

```typescript
import OpenAI from 'openai'
import type { LLMMessage, Tool, LLMResponse, ToolCall } from '@shared/types'
import type { LLMClient, LLMClientOptions } from './client'

export class OpenAIClient implements LLMClient {
  private openai: OpenAI
  private model: string

  constructor({ apiKey, model }: LLMClientOptions) {
    this.openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
    this.model = model
  }

  async chat(messages: LLMMessage[], tools: Tool[] = []): Promise<LLMResponse> {
    const oaiMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'tool',
      content: m.content,
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      ...(m.toolName ? { name: m.toolName } : {}),
    }))

    const oaiTools = tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
          ),
        },
      },
    }))

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: oaiMessages,
      ...(oaiTools.length > 0 ? { tools: oaiTools } : {}),
    })

    const choice = response.choices[0]
    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      params: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }))

    return {
      content: choice.message.content ?? '',
      toolCalls,
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use'
        : choice.finish_reason === 'length' ? 'max_tokens'
        : 'end_turn',
    }
  }
}
```

- [ ] **Step 4: Create src/worker/llm/gemini.ts**

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { LLMMessage, Tool, LLMResponse, ToolCall } from '@shared/types'
import type { LLMClient, LLMClientOptions } from './client'

export class GeminiClient implements LLMClient {
  private genAI: GoogleGenerativeAI
  private model: string

  constructor({ apiKey, model }: LLMClientOptions) {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.model = model
  }

  async chat(messages: LLMMessage[], tools: Tool[] = []): Promise<LLMResponse> {
    const geminiModel = this.genAI.getGenerativeModel({ model: this.model })

    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const lastMessage = messages[messages.length - 1]

    const functionDeclarations = tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: 'OBJECT' as const,
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type.toUpperCase(), description: v.description }])
        ),
      },
    }))

    const result = await geminiModel.generateContent({
      contents: [...history, { role: 'user', parts: [{ text: lastMessage.content }] }],
      ...(functionDeclarations.length > 0 ? { tools: [{ functionDeclarations }] } : {}),
    })

    const response = result.response
    const functionCalls = response.functionCalls?.() ?? []
    const toolCalls: ToolCall[] = functionCalls.map((fc, i) => ({
      id: `gemini_call_${i}`,
      name: fc.name,
      params: fc.args as Record<string, unknown>,
    }))

    return {
      content: response.text(),
      toolCalls,
      stopReason: functionCalls.length > 0 ? 'tool_use' : 'end_turn',
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/worker/llm/openai.test.ts src/worker/llm/gemini.test.ts`
Expected: PASS — 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/worker/llm/openai.ts src/worker/llm/openai.test.ts src/worker/llm/gemini.ts src/worker/llm/gemini.test.ts
git commit -m "feat: OpenAI and Gemini LLM client implementations"
```

---

### Task 9: Working Memory

**Files:**
- Create: `src/worker/memory/working.ts`
- Create: `src/worker/memory/working.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/worker/memory/working.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { WorkingMemoryManager } from './working'

describe('WorkingMemoryManager', () => {
  let manager: WorkingMemoryManager

  beforeEach(() => { manager = new WorkingMemoryManager() })

  it('creates working memory for a task', () => {
    manager.init('task-1')
    expect(manager.getContext('task-1')?.messages).toEqual([])
  })

  it('appends messages', () => {
    manager.init('task-1')
    manager.appendMessage('task-1', { role: 'user', content: 'Hello' })
    manager.appendMessage('task-1', { role: 'assistant', content: 'Hi' })
    expect(manager.getContext('task-1')!.messages).toHaveLength(2)
  })

  it('logs tool calls', () => {
    manager.init('task-1')
    manager.logToolCall('task-1', 'dom.getText', { selector: '#main' }, 'page text')
    expect(manager.getContext('task-1')!.toolCallLog).toHaveLength(1)
    expect(manager.getContext('task-1')!.toolCallLog[0].tool).toBe('dom.getText')
  })

  it('clears task memory', () => {
    manager.init('task-1')
    manager.appendMessage('task-1', { role: 'user', content: 'Test' })
    manager.clear('task-1')
    expect(manager.getContext('task-1')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/worker/memory/working.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create src/worker/memory/working.ts**

```typescript
import type { WorkingMemory, LLMMessage } from '@shared/types'

export class WorkingMemoryManager {
  private store = new Map<string, WorkingMemory>()

  init(taskId: string): void {
    this.store.set(taskId, { taskId, messages: [], toolCallLog: [] })
  }

  getContext(taskId: string): WorkingMemory | undefined {
    return this.store.get(taskId)
  }

  appendMessage(taskId: string, message: LLMMessage): void {
    const ctx = this.store.get(taskId)
    if (!ctx) throw new Error(`No working memory for task: ${taskId}`)
    ctx.messages.push(message)
  }

  logToolCall(taskId: string, tool: string, params: unknown, result: unknown): void {
    const ctx = this.store.get(taskId)
    if (!ctx) throw new Error(`No working memory for task: ${taskId}`)
    ctx.toolCallLog.push({ tool, params, result, ts: Date.now() })
  }

  clear(taskId: string): void {
    this.store.delete(taskId)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/worker/memory/working.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/worker/memory/working.ts src/worker/memory/working.test.ts
git commit -m "feat: working memory manager"
```

---

### Task 10: Episodic & Knowledge Memory Stores

**Files:**
- Create: `src/worker/memory/episodic.ts`
- Create: `src/worker/memory/episodic.test.ts`
- Create: `src/worker/memory/knowledge.ts`
- Create: `src/worker/memory/knowledge.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/worker/memory/episodic.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { EpisodicMemory } from './episodic'

describe('EpisodicMemory', () => {
  let episodic: EpisodicMemory

  beforeEach(async () => {
    episodic = new EpisodicMemory()
    await episodic.init()
  })

  it('saves and searches episodes', async () => {
    await episodic.save({ summary: 'User searched for hotels', domain: 'booking.com', tags: ['search'] })
    const results = await episodic.search('hotels')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].summary).toContain('hotels')
  })

  it('lists all episodes', async () => {
    await episodic.save({ summary: 'Task A', domain: 'a.com', tags: [] })
    await episodic.save({ summary: 'Task B', domain: 'b.com', tags: [] })
    expect((await episodic.list()).length).toBeGreaterThanOrEqual(2)
  })

  it('deletes an episode', async () => {
    await episodic.save({ summary: 'Delete me', domain: 'test.com', tags: [] })
    const id = (await episodic.list())[0].id
    await episodic.delete(id)
    expect((await episodic.list()).find(e => e.id === id)).toBeUndefined()
  })
})
```

Create `src/worker/memory/knowledge.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { KnowledgeStore } from './knowledge'

describe('KnowledgeStore', () => {
  let store: KnowledgeStore

  beforeEach(async () => {
    store = new KnowledgeStore()
    await store.init()
  })

  it('sets and gets a value', async () => {
    await store.set('user.name', 'Alice', ['profile'])
    expect((await store.get('user.name'))?.value).toBe('Alice')
  })

  it('returns undefined for missing key', async () => {
    expect(await store.get('nonexistent')).toBeUndefined()
  })

  it('searches by tag', async () => {
    await store.set('pref.theme', 'dark', ['prefs'])
    await store.set('pref.lang', 'zh', ['prefs'])
    expect((await store.searchByTag('prefs')).length).toBeGreaterThanOrEqual(2)
  })

  it('deletes a key', async () => {
    await store.set('temp', 'value', [])
    await store.delete('temp')
    expect(await store.get('temp')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/worker/memory/episodic.test.ts src/worker/memory/knowledge.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create src/worker/memory/episodic.ts**

```typescript
import type { Episode } from '@shared/types'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('multiagent-episodes', 1)
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('episodes', { keyPath: 'id' })
      store.createIndex('tags', 'tags', { multiEntry: true })
      store.createIndex('domain', 'domain')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class EpisodicMemory {
  private db!: IDBDatabase

  async init(): Promise<void> { this.db = await openDB() }

  async save(entry: Omit<Episode, 'id' | 'createdAt'>): Promise<string> {
    const episode: Episode = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() }
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('episodes', 'readwrite').objectStore('episodes').add(episode)
      req.onsuccess = () => resolve(episode.id)
      req.onerror = () => reject(req.error)
    })
  }

  async list(): Promise<Episode[]> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('episodes', 'readonly').objectStore('episodes').getAll()
      req.onsuccess = () => resolve(req.result as Episode[])
      req.onerror = () => reject(req.error)
    })
  }

  async search(keyword: string): Promise<Episode[]> {
    const lower = keyword.toLowerCase()
    return (await this.list()).filter(e =>
      e.summary.toLowerCase().includes(lower) ||
      e.tags.some(t => t.toLowerCase().includes(lower)) ||
      e.domain.toLowerCase().includes(lower)
    )
  }

  async delete(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('episodes', 'readwrite').objectStore('episodes').delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
}
```

- [ ] **Step 4: Create src/worker/memory/knowledge.ts**

```typescript
import type { KnowledgeEntry } from '@shared/types'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('multiagent-knowledge', 1)
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('knowledge', { keyPath: 'key' })
      store.createIndex('tags', 'tags', { multiEntry: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class KnowledgeStore {
  private db!: IDBDatabase

  async init(): Promise<void> { this.db = await openDB() }

  async set(key: string, value: string, tags: string[]): Promise<void> {
    const entry: KnowledgeEntry = { key, value, tags, updatedAt: Date.now() }
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('knowledge', 'readwrite').objectStore('knowledge').put(entry)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async get(key: string): Promise<KnowledgeEntry | undefined> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('knowledge', 'readonly').objectStore('knowledge').get(key)
      req.onsuccess = () => resolve(req.result as KnowledgeEntry | undefined)
      req.onerror = () => reject(req.error)
    })
  }

  async searchByTag(tag: string): Promise<KnowledgeEntry[]> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('knowledge', 'readonly').objectStore('knowledge').index('tags').getAll(tag)
      req.onsuccess = () => resolve(req.result as KnowledgeEntry[])
      req.onerror = () => reject(req.error)
    })
  }

  async list(): Promise<KnowledgeEntry[]> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('knowledge', 'readonly').objectStore('knowledge').getAll()
      req.onsuccess = () => resolve(req.result as KnowledgeEntry[])
      req.onerror = () => reject(req.error)
    })
  }

  async delete(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('knowledge', 'readwrite').objectStore('knowledge').delete(key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/worker/memory/episodic.test.ts src/worker/memory/knowledge.test.ts`
Expected: PASS — 7 tests pass total.

- [ ] **Step 6: Commit**

```bash
git add src/worker/memory/episodic.ts src/worker/memory/episodic.test.ts src/worker/memory/knowledge.ts src/worker/memory/knowledge.test.ts
git commit -m "feat: episodic and knowledge memory stores"
```

---

### Task 11: Skill & Agent Registries

**Files:**
- Create: `src/worker/skill-registry.ts`
- Create: `src/worker/skill-registry.test.ts`
- Create: `src/worker/agent-registry.ts`
- Create: `src/worker/agent-registry.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/worker/skill-registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { SkillRegistry } from './skill-registry'

const skillMd = `---
name: read-page
type: skill
description: Read page text
tool: dom.getText
parameters:
  selector: string
---
Returns visible text content.`

describe('SkillRegistry', () => {
  let registry: SkillRegistry

  beforeEach(async () => {
    registry = new SkillRegistry()
    await registry.init()
  })

  it('installs and retrieves a skill', async () => {
    await registry.install(skillMd)
    const skill = await registry.get('read-page')
    expect(skill?.tool).toBe('dom.getText')
  })

  it('lists all skills', async () => {
    await registry.install(skillMd)
    expect((await registry.list()).some(s => s.name === 'read-page')).toBe(true)
  })

  it('deletes a skill', async () => {
    await registry.install(skillMd)
    await registry.delete('read-page')
    expect(await registry.get('read-page')).toBeUndefined()
  })
})
```

Create `src/worker/agent-registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { AgentRegistry } from './agent-registry'

const agentMd = `---
name: researcher
type: agent
description: Researches pages
skills:
  - read-page
llm: claude-opus-4-7
---
You research web pages.`

describe('AgentRegistry', () => {
  let registry: AgentRegistry

  beforeEach(async () => {
    registry = new AgentRegistry()
    await registry.init()
  })

  it('installs and retrieves an agent', async () => {
    await registry.install(agentMd)
    const agent = await registry.get('researcher')
    expect(agent?.llm).toBe('claude-opus-4-7')
    expect(agent?.skills).toContain('read-page')
  })

  it('lists all agents', async () => {
    await registry.install(agentMd)
    expect((await registry.list()).some(a => a.name === 'researcher')).toBe(true)
  })

  it('deletes an agent', async () => {
    await registry.install(agentMd)
    await registry.delete('researcher')
    expect(await registry.get('researcher')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/worker/skill-registry.test.ts src/worker/agent-registry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create src/worker/skill-registry.ts**

```typescript
import type { SkillDef } from '@shared/types'
import { parseSkillMarkdown } from './markdown-parser'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('multiagent-skills', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('skills', { keyPath: 'name' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class SkillRegistry {
  private db!: IDBDatabase

  async init(): Promise<void> { this.db = await openDB() }

  async install(markdown: string): Promise<void> {
    const skill = parseSkillMarkdown(markdown)
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('skills', 'readwrite').objectStore('skills').put(skill)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async get(name: string): Promise<SkillDef | undefined> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('skills', 'readonly').objectStore('skills').get(name)
      req.onsuccess = () => resolve(req.result as SkillDef | undefined)
      req.onerror = () => reject(req.error)
    })
  }

  async list(): Promise<SkillDef[]> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('skills', 'readonly').objectStore('skills').getAll()
      req.onsuccess = () => resolve(req.result as SkillDef[])
      req.onerror = () => reject(req.error)
    })
  }

  async delete(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('skills', 'readwrite').objectStore('skills').delete(name)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
}
```

- [ ] **Step 4: Create src/worker/agent-registry.ts**

```typescript
import type { AgentDef } from '@shared/types'
import { parseAgentMarkdown } from './markdown-parser'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('multiagent-agents', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('agents', { keyPath: 'name' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class AgentRegistry {
  private db!: IDBDatabase

  async init(): Promise<void> { this.db = await openDB() }

  async install(markdown: string): Promise<void> {
    const agent = parseAgentMarkdown(markdown)
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('agents', 'readwrite').objectStore('agents').put(agent)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async get(name: string): Promise<AgentDef | undefined> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('agents', 'readonly').objectStore('agents').get(name)
      req.onsuccess = () => resolve(req.result as AgentDef | undefined)
      req.onerror = () => reject(req.error)
    })
  }

  async list(): Promise<AgentDef[]> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('agents', 'readonly').objectStore('agents').getAll()
      req.onsuccess = () => resolve(req.result as AgentDef[])
      req.onerror = () => reject(req.error)
    })
  }

  async delete(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('agents', 'readwrite').objectStore('agents').delete(name)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/worker/skill-registry.test.ts src/worker/agent-registry.test.ts`
Expected: PASS — 6 tests pass total.

- [ ] **Step 6: Commit**

```bash
git add src/worker/skill-registry.ts src/worker/skill-registry.test.ts src/worker/agent-registry.ts src/worker/agent-registry.test.ts
git commit -m "feat: skill and agent registries with IndexedDB persistence"
```

---

### Task 12: Agent Runtime

**Files:**
- Create: `src/worker/agent-runtime.ts`
- Create: `src/worker/agent-runtime.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/worker/agent-runtime.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { AgentRuntime } from './agent-runtime'
import type { AgentDef, LLMResponse } from '@shared/types'
import type { LLMClient } from './llm/client'

const mockAgent: AgentDef = {
  name: 'test-agent',
  description: 'Test',
  skills: ['dom.getText'],
  llm: 'claude-opus-4-7',
  systemPrompt: 'You are a test agent.',
}

function makeMockClient(responses: LLMResponse[]): LLMClient {
  let i = 0
  return { chat: vi.fn().mockImplementation(async () => responses[i++] ?? { content: 'done', toolCalls: [], stopReason: 'end_turn' }) }
}

describe('AgentRuntime', () => {
  it('returns response when no tools needed', async () => {
    const runtime = new AgentRuntime({
      agent: mockAgent,
      client: makeMockClient([{ content: 'Task complete', toolCalls: [], stopReason: 'end_turn' }]),
      executeToolCall: vi.fn(),
      maxToolCalls: 10,
    })
    expect(await runtime.run('Do a task', 'task-1')).toBe('Task complete')
  })

  it('executes tool calls then continues', async () => {
    const executeToolCall = vi.fn().mockResolvedValue('page text')
    const runtime = new AgentRuntime({
      agent: mockAgent,
      client: makeMockClient([
        { content: '', toolCalls: [{ id: 'c1', name: 'dom.getText', params: {} }], stopReason: 'tool_use' },
        { content: 'Found: page text', toolCalls: [], stopReason: 'end_turn' },
      ]),
      executeToolCall,
      maxToolCalls: 10,
    })
    const result = await runtime.run('Read page', 'task-2')
    expect(executeToolCall).toHaveBeenCalledWith('dom.getText', {})
    expect(result).toBe('Found: page text')
  })

  it('throws when max tool calls exceeded', async () => {
    const loopResponse: LLMResponse = { content: '', toolCalls: [{ id: 'c1', name: 'dom.getText', params: {} }], stopReason: 'tool_use' }
    const runtime = new AgentRuntime({
      agent: mockAgent,
      client: makeMockClient(Array(15).fill(loopResponse)),
      executeToolCall: vi.fn().mockResolvedValue('text'),
      maxToolCalls: 3,
    })
    await expect(runtime.run('loop', 'task-3')).rejects.toThrow('Max tool calls')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/worker/agent-runtime.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create src/worker/agent-runtime.ts**

```typescript
import type { AgentDef, LLMMessage, Tool } from '@shared/types'
import type { LLMClient } from './llm/client'

interface AgentRuntimeOptions {
  agent: AgentDef
  client: LLMClient
  executeToolCall: (tool: string, params: Record<string, unknown>) => Promise<unknown>
  maxToolCalls: number
}

export class AgentRuntime {
  private options: AgentRuntimeOptions

  constructor(options: AgentRuntimeOptions) {
    this.options = options
  }

  async run(userMessage: string, _taskId: string): Promise<string> {
    const { agent, client, executeToolCall, maxToolCalls } = this.options
    const messages: LLMMessage[] = [
      { role: 'user', content: agent.systemPrompt + '\n\n' + userMessage },
    ]
    const tools: Tool[] = agent.skills.map(name => ({
      name,
      description: `Execute skill: ${name}`,
      parameters: {},
    }))

    let toolCallCount = 0
    while (true) {
      const response = await client.chat(messages, tools)
      if (response.stopReason === 'end_turn' || response.toolCalls.length === 0) {
        return response.content
      }
      messages.push({ role: 'assistant', content: response.content })
      for (const toolCall of response.toolCalls) {
        if (toolCallCount >= maxToolCalls) {
          throw new Error(`Max tool calls (${maxToolCalls}) exceeded`)
        }
        toolCallCount++
        const result = await executeToolCall(toolCall.name, toolCall.params)
        messages.push({
          role: 'tool',
          content: typeof result === 'string' ? result : JSON.stringify(result),
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        })
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/worker/agent-runtime.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/worker/agent-runtime.ts src/worker/agent-runtime.test.ts
git commit -m "feat: agent runtime with tool call loop"
```

---

### Task 13: Orchestrator

**Files:**
- Create: `src/worker/orchestrator.ts`
- Create: `src/worker/orchestrator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/worker/orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { Orchestrator } from './orchestrator'
import type { AgentDef, GlobalConfig } from '@shared/types'

const mockAgent: AgentDef = {
  name: 'researcher',
  description: 'Researches pages',
  skills: ['dom.getText'],
  llm: 'claude-opus-4-7',
  systemPrompt: 'You research pages.',
}

const mockConfig: GlobalConfig = {
  defaultProvider: 'claude',
  defaultModel: 'claude-opus-4-7',
  maxToolCallsPerTask: 20,
  maxEpisodes: 100,
}

vi.mock('./agent-runtime', () => ({
  AgentRuntime: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue('Research complete'),
  })),
}))

vi.mock('./llm/client', () => ({
  getLLMClient: vi.fn().mockReturnValue({ chat: vi.fn() }),
}))

describe('Orchestrator', () => {
  it('dispatches to first available agent and returns result', async () => {
    const orchestrator = new Orchestrator({
      getApiKey: vi.fn().mockResolvedValue('test-key'),
      getConfig: vi.fn().mockResolvedValue(mockConfig),
      executeToolCall: vi.fn(),
      listAgents: vi.fn().mockResolvedValue([mockAgent]),
    })
    const result = await orchestrator.handleUserMessage('task-1', 'Research this')
    expect(result).toBe('Research complete')
  })

  it('falls back to default agent when none registered', async () => {
    const orchestrator = new Orchestrator({
      getApiKey: vi.fn().mockResolvedValue('test-key'),
      getConfig: vi.fn().mockResolvedValue(mockConfig),
      executeToolCall: vi.fn(),
      listAgents: vi.fn().mockResolvedValue([]),
    })
    const result = await orchestrator.handleUserMessage('task-2', 'Hello')
    expect(typeof result).toBe('string')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/worker/orchestrator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create src/worker/orchestrator.ts**

```typescript
import type { AgentDef, GlobalConfig } from '@shared/types'
import { AgentRuntime } from './agent-runtime'
import { getLLMClient } from './llm/client'

interface OrchestratorOptions {
  getApiKey: (provider: string) => Promise<string>
  getConfig: () => Promise<GlobalConfig>
  executeToolCall: (tool: string, params: Record<string, unknown>) => Promise<unknown>
  listAgents: () => Promise<AgentDef[]>
}

export class Orchestrator {
  private options: OrchestratorOptions

  constructor(options: OrchestratorOptions) {
    this.options = options
  }

  async handleUserMessage(taskId: string, message: string): Promise<string> {
    const { getApiKey, getConfig, executeToolCall, listAgents } = this.options
    const config = await getConfig()
    const agents = await listAgents()
    const agent = agents[0] ?? this.defaultAgent(config)

    const provider = agent.llm.startsWith('gpt') ? 'openai'
      : agent.llm.startsWith('gemini') ? 'gemini'
      : 'claude'

    const apiKey = await getApiKey(provider)
    const client = getLLMClient(provider, { apiKey, model: agent.llm })
    const runtime = new AgentRuntime({ agent, client, executeToolCall, maxToolCalls: config.maxToolCallsPerTask })
    return runtime.run(message, taskId)
  }

  private defaultAgent(config: GlobalConfig): AgentDef {
    return {
      name: 'default',
      description: 'Default assistant',
      skills: [],
      llm: config.defaultModel,
      systemPrompt: 'You are a helpful browser assistant. Answer concisely.',
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/worker/orchestrator.test.ts`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/worker/orchestrator.ts src/worker/orchestrator.test.ts
git commit -m "feat: orchestrator routes user messages to agents"
```

---

### Task 14: Service Worker Entry Point

**Files:**
- Create: `src/worker/index.ts`

No unit test — this is the Chrome Extension entry that requires `chrome.*` APIs only available at runtime.

- [ ] **Step 1: Create src/worker/index.ts**

```typescript
import { MessageType } from '@shared/messages'
import type { GlobalConfig } from '@shared/types'
import { Orchestrator } from './orchestrator'
import { SkillRegistry } from './skill-registry'
import { AgentRegistry } from './agent-registry'
import { EpisodicMemory } from './memory/episodic'
import { KnowledgeStore } from './memory/knowledge'

let skillRegistry: SkillRegistry
let agentRegistry: AgentRegistry
let episodicMemory: EpisodicMemory
let knowledgeStore: KnowledgeStore
let orchestrator: Orchestrator
let initialized = false

async function init() {
  if (initialized) return
  initialized = true
  skillRegistry = new SkillRegistry()
  agentRegistry = new AgentRegistry()
  episodicMemory = new EpisodicMemory()
  knowledgeStore = new KnowledgeStore()
  await Promise.all([
    skillRegistry.init(),
    agentRegistry.init(),
    episodicMemory.init(),
    knowledgeStore.init(),
  ])
  orchestrator = new Orchestrator({
    getApiKey: async (provider) => {
      const result = await chrome.storage.local.get(`apiKey_${provider}`)
      return (result[`apiKey_${provider}`] as string) ?? ''
    },
    getConfig: async () => {
      const result = await chrome.storage.local.get('config')
      return (result.config as GlobalConfig) ?? {
        defaultProvider: 'claude',
        defaultModel: 'claude-opus-4-7',
        maxToolCallsPerTask: 20,
        maxEpisodes: 100,
      }
    },
    executeToolCall: async (tool, params) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active tab')
      if (tool === 'page.screenshot') {
        return chrome.tabs.captureVisibleTab(undefined, { format: 'png' })
      }
      if (tool === 'nav.newTab') {
        const { url } = params as { url?: string }
        return chrome.tabs.create({ url })
      }
      return chrome.tabs.sendMessage(tab.id, {
        type: MessageType.TOOL_CALL,
        requestId: crypto.randomUUID(),
        payload: { tool, params },
      })
    },
    listAgents: () => agentRegistry.list(),
  })
}

chrome.runtime.onInstalled.addListener(() => { init() })
chrome.runtime.onStartup.addListener(() => { init() })

// Keep service worker alive during active tasks (alarms fire every ~24s)
chrome.alarms.create('keepalive', { periodInMinutes: 0.4 })
chrome.alarms.onAlarm.addListener((_alarm) => { /* ping to prevent termination */ })

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    await init()
    return handleMessage(message as { type: MessageType; requestId: string; payload?: unknown })
  })().then(sendResponse).catch(err => sendResponse({ error: String(err) }))
  return true
})

async function handleMessage(message: { type: MessageType; requestId: string; payload?: unknown }): Promise<unknown> {
  const { type, requestId, payload } = message

  switch (type) {
    case MessageType.USER_MESSAGE: {
      const { text } = payload as { text: string }
      const result = await orchestrator.handleUserMessage(crypto.randomUUID(), text)
      return { type: MessageType.AGENT_MESSAGE, requestId, payload: { text: result, agentName: 'assistant' } }
    }
    case MessageType.LIST_SKILLS:
      return { type: MessageType.RESPONSE, requestId, payload: await skillRegistry.list() }
    case MessageType.INSTALL_SKILL:
      await skillRegistry.install((payload as { markdown: string }).markdown)
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    case MessageType.DELETE_SKILL:
      await skillRegistry.delete((payload as { name: string }).name)
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    case MessageType.LIST_AGENTS:
      return { type: MessageType.RESPONSE, requestId, payload: await agentRegistry.list() }
    case MessageType.INSTALL_AGENT:
      await agentRegistry.install((payload as { markdown: string }).markdown)
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    case MessageType.DELETE_AGENT:
      await agentRegistry.delete((payload as { name: string }).name)
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    case MessageType.LIST_EPISODES:
      return { type: MessageType.RESPONSE, requestId, payload: await episodicMemory.list() }
    case MessageType.DELETE_EPISODE:
      await episodicMemory.delete((payload as { id: string }).id)
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    case MessageType.LIST_KNOWLEDGE:
      return { type: MessageType.RESPONSE, requestId, payload: await knowledgeStore.list() }
    case MessageType.DELETE_KNOWLEDGE:
      await knowledgeStore.delete((payload as { key: string }).key)
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    case MessageType.GET_CONFIG: {
      const result = await chrome.storage.local.get('config')
      return { type: MessageType.RESPONSE, requestId, payload: result.config ?? {} }
    }
    case MessageType.SET_CONFIG:
      await chrome.storage.local.set({ config: (payload as { config: GlobalConfig }).config })
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    case MessageType.SET_API_KEY: {
      const { provider, key } = payload as { provider: string; key: string }
      await chrome.storage.local.set({ [`apiKey_${provider}`]: key })
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    }
    default:
      throw new Error(`Unhandled message type: ${type}`)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat: service worker entry point — message router and keepalive"
```

---

### Task 15: Side Panel UI

**Files:**
- Create: `src/sidepanel/main.tsx`
- Create: `src/sidepanel/App.tsx`
- Create: `src/sidepanel/components/MessageBubble.tsx`
- Create: `src/sidepanel/components/ChatPanel.tsx`
- Create: `src/sidepanel/components/FileDropZone.tsx`
- Create: `src/sidepanel/pages/SkillsPage.tsx`
- Create: `src/sidepanel/pages/MemoryPage.tsx`
- Create: `src/sidepanel/pages/SettingsPage.tsx`

- [ ] **Step 1: Create src/sidepanel/main.tsx**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
)
```

- [ ] **Step 2: Create src/sidepanel/components/MessageBubble.tsx**

```tsx
interface Props {
  role: 'user' | 'assistant'
  content: string
  agentName?: string
}

export default function MessageBubble({ role, content, agentName }: Props) {
  const isUser = role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      <div style={{
        maxWidth: '80%', padding: '8px 12px', borderRadius: 12,
        background: isUser ? '#6366f1' : '#f3f4f6',
        color: isUser ? '#fff' : '#111', fontSize: 14, lineHeight: 1.5,
      }}>
        {!isUser && agentName && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{agentName}</div>}
        <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create src/sidepanel/components/ChatPanel.tsx**

```tsx
import { useState, useRef, useEffect } from 'react'
import { MessageType } from '@shared/messages'
import MessageBubble from './MessageBubble'

interface Message { id: string; role: 'user' | 'assistant'; content: string; agentName?: string }

function sendToWorker(type: MessageType, payload: unknown): Promise<{ payload: { text: string; agentName: string } }> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload }, r =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
    )
  )
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: text }])
    setLoading(true)
    try {
      const response = await sendToWorker(MessageType.USER_MESSAGE, { text })
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant',
        content: response.payload.text, agentName: response.payload.agentName,
      }])
    } catch (err) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${err}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 }}>
            Start a conversation with your agent
          </div>
        )}
        {messages.map(msg => <MessageBubble key={msg.id} role={msg.role} content={msg.content} agentName={msg.agentName} />)}
        {loading && <MessageBubble role="assistant" content="Thinking…" />}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '8px 16px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Message your agent…"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', opacity: loading || !input.trim() ? 0.5 : 1 }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create src/sidepanel/components/FileDropZone.tsx**

```tsx
import { useRef } from 'react'

interface Props { onFile: (content: string, filename: string) => void; label: string }

export default function FileDropZone({ onFile, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).filter(f => f.name.endsWith('.md')).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => onFile(reader.result as string, file.name)
      reader.readAsText(file)
    })
  }

  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
      onClick={() => inputRef.current?.click()}
      style={{ border: '2px dashed #d1d5db', borderRadius: 8, padding: 24, textAlign: 'center', cursor: 'pointer', color: '#6b7280', fontSize: 13 }}
    >
      {label}
      <input ref={inputRef} type="file" accept=".md" multiple hidden onChange={e => handleFiles(e.target.files)} />
    </div>
  )
}
```

- [ ] **Step 5: Create src/sidepanel/pages/SkillsPage.tsx**

```tsx
import { useState, useEffect } from 'react'
import { MessageType } from '@shared/messages'
import type { SkillDef } from '@shared/types'
import FileDropZone from '../components/FileDropZone'

function send(type: MessageType, payload?: unknown): Promise<{ payload: unknown }> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload }, r =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
    )
  )
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillDef[]>([])

  async function load() {
    const r = await send(MessageType.LIST_SKILLS)
    setSkills(r.payload as SkillDef[])
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 12, fontSize: 15, fontWeight: 600 }}>Skills</h2>
      <FileDropZone
        onFile={async (content) => { await send(MessageType.INSTALL_SKILL, { markdown: content }); load() }}
        label="Drop .md skill files here to install"
      />
      <div style={{ marginTop: 16 }}>
        {skills.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13 }}>No skills installed.</p>}
        {skills.map(skill => (
          <div key={skill.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{skill.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{skill.description}</div>
            </div>
            <button onClick={async () => { await send(MessageType.DELETE_SKILL, { name: skill.name }); load() }} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create src/sidepanel/pages/MemoryPage.tsx**

```tsx
import { useState, useEffect } from 'react'
import { MessageType } from '@shared/messages'
import type { Episode, KnowledgeEntry } from '@shared/types'

function send(type: MessageType, payload?: unknown): Promise<{ payload: unknown }> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload }, r =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
    )
  )
}

export default function MemoryPage() {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([])
  const [tab, setTab] = useState<'episodic' | 'knowledge'>('episodic')

  async function load() {
    const [ep, kn] = await Promise.all([send(MessageType.LIST_EPISODES), send(MessageType.LIST_KNOWLEDGE)])
    setEpisodes((ep.payload as Episode[]).sort((a, b) => b.createdAt - a.createdAt))
    setKnowledge(kn.payload as KnowledgeEntry[])
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 12, fontSize: 15, fontWeight: 600 }}>Memory</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['episodic', 'knowledge'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: tab === t ? '#6366f1' : '#fff', color: tab === t ? '#fff' : '#374151', cursor: 'pointer', fontSize: 12, textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>
      {tab === 'episodic' && (
        <div>
          {episodes.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13 }}>No episodes yet.</p>}
          {episodes.map(ep => (
            <div key={ep.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13 }}>{ep.summary}</span>
                <button onClick={async () => { await send(MessageType.DELETE_EPISODE, { id: ep.id }); load() }} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>×</button>
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{ep.domain} · {new Date(ep.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
      {tab === 'knowledge' && (
        <div>
          {knowledge.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13 }}>No knowledge entries yet.</p>}
          {knowledge.map(kn => (
            <div key={kn.key} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{kn.key}</span>
                <button onClick={async () => { await send(MessageType.DELETE_KNOWLEDGE, { key: kn.key }); load() }} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>×</button>
              </div>
              <div style={{ fontSize: 12, color: '#374151' }}>{kn.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Create src/sidepanel/pages/SettingsPage.tsx**

```tsx
import { useState, useEffect } from 'react'
import { MessageType } from '@shared/messages'
import type { GlobalConfig, LLMProvider } from '@shared/types'

function send(type: MessageType, payload?: unknown): Promise<{ payload: unknown }> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload }, r =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
    )
  )
}

const PROVIDERS: LLMProvider[] = ['claude', 'openai', 'gemini']

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({ claude: '', openai: '', gemini: '' })
  const [config, setConfig] = useState<GlobalConfig>({ defaultProvider: 'claude', defaultModel: 'claude-opus-4-7', maxToolCallsPerTask: 20, maxEpisodes: 100 })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    send(MessageType.GET_CONFIG).then(r => { if (r.payload) setConfig(r.payload as GlobalConfig) })
  }, [])

  async function handleSave() {
    await send(MessageType.SET_CONFIG, { config })
    for (const provider of PROVIDERS) {
      if (apiKeys[provider]) await send(MessageType.SET_API_KEY, { provider, key: apiKeys[provider] })
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Settings</h2>
      <section style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>API Keys</h3>
        {PROVIDERS.map(provider => (
          <div key={provider} style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2, textTransform: 'capitalize' }}>{provider}</label>
            <input type="password" placeholder={`Enter ${provider} API key`} value={apiKeys[provider]} onChange={e => setApiKeys(prev => ({ ...prev, [provider]: e.target.value }))} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
          </div>
        ))}
      </section>
      <section style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>General</h3>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Default Model</label>
          <input value={config.defaultModel} onChange={e => setConfig(prev => ({ ...prev, defaultModel: e.target.value }))} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Max Tool Calls Per Task</label>
          <input type="number" value={config.maxToolCallsPerTask} onChange={e => setConfig(prev => ({ ...prev, maxToolCallsPerTask: Number(e.target.value) }))} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
        </div>
      </section>
      <button onClick={handleSave} style={{ width: '100%', padding: 8, borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 14 }}>
        {saved ? 'Saved' : 'Save Settings'}
      </button>
    </div>
  )
}
```

- [ ] **Step 8: Create src/sidepanel/App.tsx**

```tsx
import { useState } from 'react'
import ChatPanel from './components/ChatPanel'
import SkillsPage from './pages/SkillsPage'
import MemoryPage from './pages/MemoryPage'
import SettingsPage from './pages/SettingsPage'

type Tab = 'chat' | 'skills' | 'memory' | 'settings'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <nav style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
        {(['chat', 'skills', 'memory', 'settings'] as Tab[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: activeTab === tab ? 700 : 400, fontSize: 13, textTransform: 'capitalize',
            borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === tab ? '#6366f1' : '#6b7280',
          }}>
            {tab}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'skills' && <SkillsPage />}
        {activeTab === 'memory' && <MemoryPage />}
        {activeTab === 'settings' && <SettingsPage />}
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add src/sidepanel/
git commit -m "feat: side panel UI — chat, skills, memory, settings"
```

---

### Task 16: Built-in Agents & Skills

**Files:**
- Create: `agents/orchestrator.md`
- Create: `skills/read-page.md`
- Create: `skills/take-screenshot.md`
- Create: `skills/navigate.md`
- Create: `skills/fill-form.md`
- Create: `skills/memory-read.md`
- Create: `skills/memory-write.md`

- [ ] **Step 1: Create agents/orchestrator.md**

```markdown
---
name: orchestrator
type: agent
description: Routes user requests to browser tools and answers directly
skills:
  - read-page
  - take-screenshot
  - navigate
  - fill-form
  - memory-read
  - memory-write
llm: claude-opus-4-7
---

You are an intelligent browser assistant with access to browser tools. Help users automate web tasks, research pages, fill forms, and remember information.

When completing a task:
1. Use the available skills step by step
2. Confirm what you did and what you found
3. Save important findings with memory-write when relevant

Be concise and action-oriented.
```

- [ ] **Step 2: Create skills/read-page.md**

```markdown
---
name: read-page
type: skill
description: Read the visible text content of the current page or a specific element
tool: dom.getText
parameters:
  selector: string
---

Reads visible text from the current page. Provide a CSS selector to target a specific element, or omit to read the entire page body.
```

- [ ] **Step 3: Create skills/take-screenshot.md**

```markdown
---
name: take-screenshot
type: skill
description: Capture a screenshot of the current visible page
tool: page.screenshot
parameters:
  selector: string
---

Captures the current visible page as a base64 PNG. Optionally target a specific element with a CSS selector.
```

- [ ] **Step 4: Create skills/navigate.md**

```markdown
---
name: navigate
type: skill
description: Navigate to a URL or go back/forward in browser history
tool: nav.goto
parameters:
  url: string
  direction: string
---

Navigate the browser. Provide url to go to a specific page, or direction ("back"/"forward") to move through history.
```

- [ ] **Step 5: Create skills/fill-form.md**

```markdown
---
name: fill-form
type: skill
description: Fill a form field and optionally submit the form
tool: dom.fill
parameters:
  selector: string
  value: string
  submit: string
---

Fills the input matching the CSS selector with the given value. Set submit to "true" to also submit the form after filling.
```

- [ ] **Step 6: Create skills/memory-read.md**

```markdown
---
name: memory-read
type: skill
description: Retrieve a value from shared knowledge by key
tool: memory.get
parameters:
  key: string
---

Reads a stored knowledge entry by key. Returns the value if found. Use to recall saved facts about the user or prior tasks.
```

- [ ] **Step 7: Create skills/memory-write.md**

```markdown
---
name: memory-write
type: skill
description: Save a key-value pair to shared knowledge for future reference
tool: memory.set
parameters:
  key: string
  value: string
  tags: string
---

Stores a fact in shared knowledge. Key should be descriptive (e.g., "user.preference.theme"). Tags are comma-separated labels. Persists across sessions and is readable by all agents.
```

- [ ] **Step 8: Commit**

```bash
git add agents/ skills/
git commit -m "feat: built-in agent and skill definitions"
```

---

### Task 17: Final Build & Manual Integration Test

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All unit tests pass. Fix any failures before continuing.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: `dist/` generated. Verify it contains:
- `dist/manifest.json`
- A service worker JS file
- A content script JS file
- `dist/src/sidepanel/sidepanel.html` (or similar)

- [ ] **Step 3: Load in Chrome**

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked" → select `dist/`
4. Verify the extension appears with no errors
5. Click the extension icon to open the side panel

- [ ] **Step 4: Test Settings**

1. Open Settings tab
2. Enter a Claude API key
3. Click Save — verify no error toast

- [ ] **Step 5: Test Chat**

1. Navigate to `https://example.com`
2. Open side panel → Chat tab
3. Send: "What is on this page?"
4. Verify the agent responds with content from the page

- [ ] **Step 6: Test Skill Install**

1. Navigate to Skills tab
2. Drop `skills/read-page.md` into the drop zone
3. Verify "read-page" appears in the list

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: complete Chrome multi-agent framework v0.1.0"
```

---

## Known Limitations (v0.1.0)

- **memory.get / memory.set skills**: Agent runtime passes skill names as tool names to the LLM. The service worker's `executeToolCall` currently routes only browser tools. Wiring `memory.get` → `knowledgeStore.get` and `memory.set` → `knowledgeStore.set` inside `executeToolCall` in `src/worker/index.ts` is a v0.2 task.
- **Skill tool descriptions**: `AgentRuntime` currently generates generic tool descriptions (`"Execute skill: read-page"`). In v0.2, load the actual `SkillDef.instructions` from the registry to give the LLM proper context.
- **Episodic memory write-back**: The orchestrator doesn't yet auto-summarize tasks into episodic memory. Add this at the end of `handleUserMessage` in v0.2.
- **net.intercept**: Requires `declarativeNetRequest` Chrome API. Not implemented in v0.1.
- **Streaming LLM responses**: Responses returned all-at-once. Add streaming via `chrome.runtime.sendMessage` with `AGENT_CHUNK` messages in v0.2.
