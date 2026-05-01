# Chrome Multi-Agent Framework Design

**Date:** 2026-05-01  
**Status:** Approved  
**Tech Stack:** TypeScript + React + Vite  

---

## Overview

A Chrome browser extension that provides a multi-agent framework for automating browser operations. It serves two audiences: end users who want personal efficiency automation, and developers who want to build browser AI agent products on top of it.

---

## Architecture

The system uses a three-layer architecture within a single Chrome Extension, with no external server dependency.

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
│                                                         │
│  ┌─────────────────┐        ┌───────────────────────┐  │
│  │   Side Panel    │        │    Service Worker      │  │
│  │  (React UI)     │◄──────►│   (Orchestrator)       │  │
│  │                 │  Msg   │   + Agent Runtime      │  │
│  │  • 对话界面     │  Pass  │   + Memory Manager     │  │
│  │  • Agent 管理   │        │   + Skill Registry     │  │
│  │  • Skill 管理   │        │   + LLM Client         │  │
│  └─────────────────┘        └──────────┬────────────┘  │
│                                         │ Msg Pass      │
│                              ┌──────────▼────────────┐  │
│                              │   Content Script      │  │
│                              │   (Tool Executor)     │  │
│                              │                       │  │
│                              │  • DOM 读写           │  │
│                              │  • 表单操作           │  │
│                              │  • 截图               │  │
│                              │  • 网络请求           │  │
│                              └───────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              IndexedDB                           │   │
│  │  agents/ | skills/ | memory/ | config/           │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                         │
                    ┌────▼────┐
                    │ Cloud   │
                    │  LLM    │
                    │  APIs   │
                    └─────────┘
```

**Layer responsibilities:**

- **Side Panel (React UI):** Pure UI layer. Handles conversation display and user input. Contains no business logic.
- **Service Worker (Orchestrator):** The brain. Runs the Orchestrator, Agent instances, memory management, and Skill scheduling. Uses `chrome.alarms` every 25 seconds to prevent the 5-minute timeout.
- **Content Script (Tool Executor):** The hands. Injected into every page. Executes actual DOM/network operations and returns results to the Service Worker.

All inter-layer communication uses `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` with a unified message format: `{ type, payload, requestId }`.

---

## Agent & Skill System

### Markdown Definition Format

Agents and Skills are defined as Markdown files. Frontmatter defines metadata; the body defines behavioral instructions (system prompt).

**Agent example:**
```markdown
---
name: web-researcher
type: agent
description: 负责网页内容抓取和信息整理
skills:
  - read-page
  - take-screenshot
  - navigate
llm: claude-opus-4-7
---

你是一个网页研究员。当收到研究任务时...
```

**Skill example:**
```markdown
---
name: read-page
type: skill
description: 读取当前页面的文本内容
tool: dom.getText
parameters:
  selector: string  # 可选，CSS选择器
---

调用此 skill 获取页面可见文本。返回结构化的文本内容。
```

### Agent Collaboration Model

Orchestrator-SubAgent (master-slave) pattern:

```
Orchestrator Agent
├── 解析用户意图
├── 选择合适的 Sub-Agent
├── 分配任务 + 传递上下文
└── 汇总结果返回用户

Sub-Agent（每个任务独立实例）
├── 加载自身 system prompt
├── 调用分配的 Skills
├── 通过 Tool Call 触发 Content Script
└── 返回结果给 Orchestrator
```

### Extension Model

Developers install Agents and Skills by dragging `.md` files into the management page or editing them inline. The framework ships a standard Skill library (DOM, forms, navigation, screenshot, network). Custom Skills compose built-in tools.

---

## Memory System

Three-layer memory model stored in IndexedDB:

```
Layer 1: Working Memory（工作记忆）
· 当前任务的对话历史 + 中间结果
· 存储在 Service Worker 内存中
· 任务结束后选择性写入长期记忆

Layer 2: Episodic Memory（情节记忆）
· 历史任务摘要、用户偏好、操作记录
· 存储在 IndexedDB episodes 表
· 按 tag/domain/time 索引，关键词检索

Layer 3: Shared Knowledge（共享知识库）
· 所有 Agent 可读写的事实条目
· 存储在 IndexedDB knowledge 表
· key-value + tags 结构，支持 Agent 间共享
```

Agents access memory through built-in Skills (`memory-read`, `memory-write`), transparent to the LLM. At task end, the Orchestrator automatically distills a summary into Episodic Memory. Users can view, edit, and delete memory entries in the Side Panel.

---

## Browser Tool Layer

Content Script exposes the following built-in tools:

| Tool | Capability | Parameters |
|------|-----------|------------|
| `dom.getText` | Read page/element text | `selector?` |
| `dom.getHTML` | Read element HTML | `selector` |
| `dom.click` | Click element | `selector` |
| `dom.fill` | Fill form field | `selector, value` |
| `dom.submit` | Submit form | `selector?` |
| `dom.waitFor` | Wait for element | `selector, timeout` |
| `page.screenshot` | Capture screenshot (base64) | `selector?` |
| `page.scroll` | Scroll page | `x, y` |
| `nav.goto` | Navigate to URL | `url` |
| `nav.back` / `nav.forward` | History navigation | — |
| `nav.newTab` | Open new tab | `url?` |
| `net.fetch` | Send request in page context | `url, options` |
| `net.intercept` | Intercept network requests | `pattern` |

**Tool call chain:**
```
LLM Tool Call
  → Service Worker parses tool_use
    → sendMessage to Content Script
      → Execute DOM/network operation
        → Return result to Service Worker
          → Insert into LLM next-turn messages
```

**Security boundaries:**
- Content Script only executes on the user's currently active tab
- `net.intercept` requires explicit user authorization in Side Panel
- All tool calls are logged to Working Memory for Orchestrator inspection

---

## LLM Client & Configuration

**Unified interface:**
```typescript
interface LLMClient {
  chat(messages: Message[], tools?: Tool[]): Promise<Response>
}
// Implementations: ClaudeClient | OpenAIClient | GeminiClient
```

Each Agent specifies its LLM in frontmatter (`llm: claude-opus-4-7`). The Orchestrator instantiates the appropriate Client on demand. API Keys are stored in `chrome.storage.local` (encrypted, not in IndexedDB).

**Configuration hierarchy:**
```
Global config (config/global.json)
├── Default LLM provider + model
├── API Keys (per provider)
├── Memory retention policy (max N entries)
└── Tool call timeout

Agent-level config (frontmatter overrides global)
└── llm, temperature, max_tokens
```

---

## Error Handling

| Scenario | Strategy |
|----------|----------|
| LLM API timeout | Retry up to 2 times; show user-friendly message on failure |
| Tool execution failure | Return error as tool result to LLM; Agent decides to retry or abort |
| Content Script not injected | Prompt user to refresh the page |
| Service Worker terminated | Persist task state to IndexedDB; resume on restart |
| Agent tool call loop | Max 20 tool calls per task (configurable) |

---

## Project Structure

```
chrome-plugin-test/
├── src/
│   ├── sidepanel/          # React UI (Side Panel)
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── pages/
│   ├── worker/             # Service Worker
│   │   ├── orchestrator.ts
│   │   ├── agent-runtime.ts
│   │   ├── skill-registry.ts
│   │   ├── memory/
│   │   │   ├── working.ts
│   │   │   ├── episodic.ts
│   │   │   └── knowledge.ts
│   │   └── llm/
│   │       ├── client.ts
│   │       ├── claude.ts
│   │       ├── openai.ts
│   │       └── gemini.ts
│   ├── content/            # Content Script
│   │   ├── index.ts
│   │   └── tools/
│   │       ├── dom.ts
│   │       ├── page.ts
│   │       ├── nav.ts
│   │       └── net.ts
│   └── shared/             # Shared types & message protocol
│       ├── types.ts
│       └── messages.ts
├── agents/                 # Built-in agent definitions (.md)
├── skills/                 # Built-in skill definitions (.md)
├── manifest.json
├── vite.config.ts
└── tsconfig.json
```
