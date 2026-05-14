import { MessageType } from '@shared/messages'
import type { QuickAction, QuickActionsPayload, TaskEventPayload } from '@shared/messages'
import type { LLMMessage, ProviderConfig, GeneralSettingsConfig } from '@shared/types'
import { validateSelectedProviderConfig } from '@shared/providerConfig'
import { llmProviderStore, generalSettingsStore } from '../storage'
import { Orchestrator } from './orchestrator'
import { SkillRegistry } from './skill-registry'
import { AgentRegistry } from './agent-registry'
import { EpisodicMemory } from './memory/episodic'
import { KnowledgeStore } from './memory/knowledge'
import { SessionMemoryManager } from './memory/session'
import { SystemMemoryManager } from './memory/system'
import { WorkingMemoryManager } from './memory/working'
import { createToolApprovalError, getToolRisk, requestToolApproval, requiresToolApproval } from './tool-approval'
import orchestratorAgentMd from '../../agents/orchestrator.md?raw'
import browserAgentMd from '../../agents/browser-agent.md?raw'
import searchAgentMd from '../../agents/search-agent.md?raw'
import jobHunterMd from '../../agents/job-hunter.md?raw'
import readPageMd from '../../skills/read-page.md?raw'
import takeScreenshotMd from '../../skills/take-screenshot.md?raw'
import navigateMd from '../../skills/navigate.md?raw'
import clickMd from '../../skills/click.md?raw'
import fillFormMd from '../../skills/fill-form.md?raw'
import memoryReadMd from '../../skills/memory-read.md?raw'
import memoryWriteMd from '../../skills/memory-write.md?raw'
import readHistoryMd from '../../skills/read-history.md?raw'

let skillRegistry: SkillRegistry
let agentRegistry: AgentRegistry
let episodicMemory: EpisodicMemory
let knowledgeStore: KnowledgeStore
let sessionMemory: SessionMemoryManager
let systemMemory: SystemMemoryManager
let workingMemory: WorkingMemoryManager
let orchestrator: Orchestrator
let initPromise: Promise<void> | null = null
let activeConversationId = 'default'

function historyKey(conversationId = activeConversationId): string {
  return `conversationHistory:${conversationId}`
}


function emitStreamChunk(payload: { taskId: string; conversationId?: string; text: string; done?: boolean }): void {
  chrome.runtime.sendMessage({
    type: MessageType.STREAM_CHUNK,
    requestId: crypto.randomUUID(),
    payload,
  }).catch?.(() => {})
}

function emitTaskEvent(payload: TaskEventPayload): void {
  chrome.runtime.sendMessage({
    type: MessageType.TASK_EVENT,
    requestId: crypto.randomUUID(),
    payload,
  }).catch?.(() => {})
}


const QUICK_ACTION_STOP_WORDS = new Set([
  'www', 'com', 'net', 'org', 'app', 'dev', 'io', 'co', 'cn', 'news', 'home', 'page', 'login', 'search',
  '的', '和', '与', '及', 'the', 'and', 'for', 'with', 'from', 'your', 'you', 'this', 'that', '最新', '首页', '登录', '搜索',
])

function addQuickActionTopic(topics: Map<string, number>, raw: string | undefined, weight = 1): void {
  if (!raw) return
  const normalized = raw
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.[a-z]{2,}$/i, ' ')
    .replace(/[\-_]/g, ' ')
  const tokens = normalized.match(/[\p{Script=Han}]{2,}|[a-z0-9]{3,}/gu) ?? []
  for (const token of tokens) {
    const clean = token.trim()
    if (!clean || QUICK_ACTION_STOP_WORDS.has(clean)) continue
    topics.set(clean, (topics.get(clean) ?? 0) + weight)
  }
}

function addBookmarkTopics(topics: Map<string, number>, nodes: chrome.bookmarks.BookmarkTreeNode[]): void {
  for (const node of nodes) {
    if (node.title) addQuickActionTopic(topics, node.title, node.url ? 2 : 1)
    if (node.children) addBookmarkTopics(topics, node.children)
  }
}

function topicLabel(topic: string): string {
  return topic.replace(/^\p{Ll}/u, char => char.toUpperCase())
}

function buildQuickActionsFromTopics(topics: Map<string, number>): QuickAction[] {
  const rankedTopics = [...topics.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .slice(0, 5)
    .map(([topic]) => topicLabel(topic))

  if (rankedTopics.length === 0) return []

  const actions: QuickAction[] = rankedTopics.map(topic => ({
    label: `关注 ${topic}`,
    prompt: `请围绕“${topic}”帮我整理近期重点信息、相关趋势和下一步可操作建议。`,
  }))

  if (actions.length === 1) {
    const [topic] = rankedTopics
    actions.push(
      {
        label: `总结 ${topic}`,
        prompt: `请总结我最近可能关注的“${topic}”资料，提炼核心观点、关键链接类型和待办事项。`,
      },
      {
        label: `规划 ${topic}`,
        prompt: `请基于“${topic}”帮我制定一个短期学习或行动计划，并列出优先级。`,
      },
    )
  } else if (actions.length === 2) {
    actions.push({
      label: '比较主题',
      prompt: `请比较“${rankedTopics[0]}”和“${rankedTopics[1]}”的近期重点、关联机会和我应该优先关注的方向。`,
    })
  }

  return actions.slice(0, 5)
}

async function getQuickActions(): Promise<QuickActionsPayload> {
  const settings = await generalSettingsStore.getSettings()
  const startTime = Date.now() - settings.memoryRetentionDays * 24 * 60 * 60 * 1000
  const maxResults = 100
  const [historyItems, bookmarkTree] = await Promise.all([
    settings.enableHistoryMemory
      ? chrome.history.search({ text: '', startTime, maxResults })
      : Promise.resolve([] as chrome.history.HistoryItem[]),
    settings.enableBookmarkMemory
      ? chrome.bookmarks.getTree()
      : Promise.resolve([] as chrome.bookmarks.BookmarkTreeNode[]),
  ])

  const topics = new Map<string, number>()
  for (const item of historyItems) {
    if (item.url) {
      try {
        const hostname = new URL(item.url).hostname
        addQuickActionTopic(topics, hostname, item.visitCount ?? 1)
      } catch { /* ignore invalid URLs */ }
    }
    addQuickActionTopic(topics, item.title, 2)
  }
  addBookmarkTopics(topics, bookmarkTree)

  return { actions: buildQuickActionsFromTopics(topics) }
}

function waitForTab(tabId: number, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout
    function check() {
      chrome.tabs.get(tabId, tab => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
        if (tab.status === 'complete') return resolve()
        if (Date.now() > deadline) return resolve()  // proceed anyway after timeout
        setTimeout(check, 200)
      })
    }
    check()
  })
}

function init(): Promise<void> {
  if (!initPromise) initPromise = doInit()
  return initPromise
}

async function doInit() {
  skillRegistry = new SkillRegistry()
  agentRegistry = new AgentRegistry()
  episodicMemory = new EpisodicMemory()
  knowledgeStore = new KnowledgeStore()
  sessionMemory = new SessionMemoryManager()
  systemMemory = new SystemMemoryManager()
  workingMemory = new WorkingMemoryManager()
  await Promise.all([
    skillRegistry.init(),
    agentRegistry.init(),
    episodicMemory.init(),
    knowledgeStore.init(),
    systemMemory.load(),
  ])
  orchestrator = new Orchestrator({
    getApiKey: async (provider) => {
      const config = await llmProviderStore.getProvider(provider)
      const key = config?.apiKey ?? ''
      if (!key) throw new Error(`No API key set for ${provider}. Please add it in Settings.`)
      return key
    },
    getConfig: async () => {
      const settings = await generalSettingsStore.getSettings()
      return {
        provider: settings.provider,
        model: settings.model,
        maxToolCallsPerTask: settings.maxToolCallsPerTask,
        maxEpisodes: settings.maxEpisodes,
        enableHistoryMemory: settings.enableHistoryMemory,
        enableBookmarkMemory: settings.enableBookmarkMemory,
        memoryRetentionDays: settings.memoryRetentionDays,
      }
    },
    loadHistory: async (conversationId) => {
      const key = historyKey(conversationId)
      const result = await chrome.storage.local.get([key, 'conversationHistory'])
      return (result[key] as LLMMessage[]) ?? (conversationId === 'default' ? (result.conversationHistory as LLMMessage[]) : undefined) ?? []
    },
    saveHistory: async (history, conversationId) => {
      await chrome.storage.local.set({ [historyKey(conversationId)]: history })
    },
    executeToolCall: async (toolLlm, params) => {
      const tool = toolLlm.replace(/_/g, '.')
      const approveToolCall = async (targetUrl?: string) => {
        if (!requiresToolApproval(tool)) return null
        const details = { tool, params, targetUrl, risk: getToolRisk(tool) }
        const approval = await requestToolApproval(details)
        if (approval.approved) return null
        const code = approval.reason === 'Approval timed out' ? 'TOOL_APPROVAL_TIMEOUT' : 'TOOL_APPROVAL_DENIED'
        return createToolApprovalError(details, code, approval.reason ?? 'Tool execution was rejected by the user')
      }

      if (tool === 'history.search') {
        const denied = await approveToolCall('chrome://history')
        if (denied) return denied
        const { query = '', max_results = '20', days_back = '7' } = params as { query?: string; max_results?: string; days_back?: string }
        const startTime = Date.now() - Number(days_back) * 24 * 60 * 60 * 1000
        const items = await chrome.history.search({ text: query, startTime, maxResults: Number(max_results) })
        return items.map(h => ({ title: h.title, url: h.url, lastVisit: new Date(h.lastVisitTime ?? 0).toLocaleString() }))
      }
      if (tool === 'memory.set') {
        const { key, value, tags, domain } = params as { key: string; value: string; tags?: string; domain?: string }
        await knowledgeStore.set(key, value, tags ? tags.split(',').map(t => t.trim()) : [], domain)
        return { ok: true }
      }
      if (tool === 'memory.get') {
        const { key } = params as { key: string }
        const entry = await knowledgeStore.get(key)
        return entry ? entry.value : null
      }
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      // If the active tab is on a restricted URL, find another usable tab
      if (tab?.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
        const tabs = await chrome.tabs.query({ currentWindow: true })
        tab = tabs.find(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://')) ?? tab
      }
      if (!tab?.id) throw new Error('No active tab')
      const approvalTargetUrl = tool === 'nav.goto' ? String((params as { url?: unknown }).url ?? tab.url ?? '') : tab.url
      if (requiresToolApproval(tool) && tab.windowId !== undefined) {
        chrome.sidePanel?.open?.({ windowId: tab.windowId })?.catch?.(() => {})
      }
      const denied = await approveToolCall(approvalTargetUrl)
      if (denied) return denied
      if (tool === 'page.screenshot') {
        return chrome.tabs.captureVisibleTab({ format: 'png' })
      }
      if (tool === 'nav.goto') {
        const { url, new_tab } = params as { url: string; new_tab?: string }
        if (new_tab === 'true') return chrome.tabs.create({ url })
        await chrome.tabs.update(tab.id, { url })
        await new Promise<void>(resolve => {
          const timer = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener)
            resolve()
          }, 15000)
          function listener(tabId: number, info: chrome.tabs.TabChangeInfo) {
            if (tabId === tab.id && info.status === 'complete') {
              clearTimeout(timer)
              chrome.tabs.onUpdated.removeListener(listener)
              // Give JS-rendered content extra time to load
              setTimeout(resolve, 2000)
            }
          }
          chrome.tabs.onUpdated.addListener(listener)
        })
        return { ok: true, url }
      }
      if (tool === 'nav.newTab') {
        const { url } = params as { url?: string }
        return chrome.tabs.create({ url })
      }
      if (tool === 'nav.back') {
        await chrome.tabs.goBack(tab.id)
        return { ok: true }
      }
      if (tool === 'nav.forward') {
        await chrome.tabs.goForward(tab.id)
        return { ok: true }
      }
      if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
        throw new Error('Cannot execute tools on this page. Switch to a normal webpage first.')
      }
      const msg = {
        type: MessageType.TOOL_CALL,
        requestId: crypto.randomUUID(),
        payload: { tool, params },
      }
      try {
        return await chrome.tabs.sendMessage(tab.id, msg)
      } catch {
        await waitForTab(tab.id)
        const files = chrome.runtime.getManifest().content_scripts?.[0]?.js ?? []
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files })
        return chrome.tabs.sendMessage(tab.id, msg)
      }
    },
    listAgents: () => agentRegistry.list(),
    listSkills: async (names: string[]) => {
      const all = await skillRegistry.list()
      return all.filter(s => names.includes(s.name))
    },
    sessionMemory,
    systemMemory,
    workingMemory,
    episodicMemory,
    knowledgeStore,
    emitTaskEvent,
    emitStreamChunk,
  })
}

async function seedBuiltins() {
  const builtinSkills = [readPageMd, takeScreenshotMd, navigateMd, clickMd, fillFormMd, memoryReadMd, memoryWriteMd, readHistoryMd]
  await Promise.all(builtinSkills.map(md => skillRegistry.install(md)))

  await agentRegistry.install(orchestratorAgentMd)
  await agentRegistry.install(browserAgentMd)
  await agentRegistry.install(searchAgentMd)
  await agentRegistry.install(jobHunterMd)
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  await init()
  await seedBuiltins()
  triggerSystemMemoryBuild()
})
chrome.runtime.onStartup.addListener(() => {
  init().then(() => {
    triggerSystemMemoryBuild()
    generalSettingsStore.getSettings().then(s => {
      episodicMemory.evict(s.maxEpisodes).catch(() => {})
      episodicMemory.deleteOlderThan(Date.now() - s.memoryRetentionDays * 24 * 60 * 60 * 1000).catch(() => {})
    })
  })
})

function triggerSystemMemoryBuild() {
  generalSettingsStore.getSettings().then(async (settings) => {
    const provider = settings.provider
    const config = await llmProviderStore.getProvider(provider)
    const key = config?.apiKey ?? ''
    if (!key) return
    const { getLLMClient } = await import('./llm/client')
    const client = getLLMClient(provider, { apiKey: key, model: settings.model })
    systemMemory.buildIfStale(client, {
      enableHistoryMemory: settings.enableHistoryMemory,
      enableBookmarkMemory: settings.enableBookmarkMemory,
      memoryRetentionDays: settings.memoryRetentionDays,
    }).catch(() => {})
  }).catch(() => {})
}

// Keep service worker alive during active tasks (alarms fire every ~24s)
chrome.alarms.create('keepalive', { periodInMinutes: 0.4 })
chrome.alarms.create('rebuild-system-memory', { periodInMinutes: 1440 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'rebuild-system-memory') triggerSystemMemoryBuild()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    await init()
    return handleMessage(message as { type: MessageType; requestId: string; payload?: unknown })
  })().then(sendResponse).catch(err => sendResponse({ error: String(err) }))
  return true
})

export async function handleMessage(message: { type: MessageType; requestId: string; payload?: unknown }): Promise<unknown> {
  const { type, requestId, payload } = message

  switch (type) {
    case MessageType.USER_MESSAGE: {
      const { text, conversationId = activeConversationId, taskId = crypto.randomUUID() } = payload as { text: string; conversationId?: string; taskId?: string }
      const settings = await generalSettingsStore.getSettings()
      const providers = await llmProviderStore.getAllProviders()
      const configError = validateSelectedProviderConfig(settings, providers)
      if (configError) return { type: MessageType.RESPONSE, requestId, error: configError }
      activeConversationId = conversationId
      const result = await orchestrator.handleUserMessage(taskId, text, conversationId)
      return { type: MessageType.AGENT_MESSAGE, requestId, payload: { text: result.content, thinking: result.thinking, agentName: 'assistant', taskId, conversationId } }
    }
    case MessageType.CANCEL_TASK: {
      const { taskId } = payload as { taskId: string }
      return { type: MessageType.RESPONSE, requestId, payload: { ok: orchestrator.cancelTask(taskId) } }
    }
    case MessageType.CREATE_CONVERSATION: {
      const conversationId = (payload as { conversationId?: string } | undefined)?.conversationId ?? crypto.randomUUID()
      activeConversationId = conversationId
      await chrome.storage.local.set({ activeConversationId, [historyKey(conversationId)]: [] })
      return { type: MessageType.RESPONSE, requestId, payload: { conversationId } }
    }
    case MessageType.SWITCH_CONVERSATION: {
      const { conversationId } = payload as { conversationId: string }
      activeConversationId = conversationId
      await chrome.storage.local.set({ activeConversationId })
      const result = await chrome.storage.local.get(historyKey(conversationId))
      return { type: MessageType.RESPONSE, requestId, payload: { conversationId, history: result[historyKey(conversationId)] ?? [] } }
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
    case MessageType.DELETE_EPISODES_BY_TAG:
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true, deleted: await episodicMemory.deleteByTag((payload as { tag: string }).tag) } }
    case MessageType.DELETE_EPISODES_BY_DOMAIN:
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true, deleted: await episodicMemory.deleteByDomain((payload as { domain: string }).domain) } }
    case MessageType.CLEAR_EPISODES:
      await episodicMemory.clear()
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    case MessageType.EXPORT_EPISODES:
      return { type: MessageType.RESPONSE, requestId, payload: await episodicMemory.exportJson() }
    case MessageType.LIST_KNOWLEDGE:
      return { type: MessageType.RESPONSE, requestId, payload: await knowledgeStore.list() }
    case MessageType.DELETE_KNOWLEDGE:
      await knowledgeStore.delete((payload as { key: string }).key)
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    case MessageType.DELETE_KNOWLEDGE_BY_TAG:
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true, deleted: await knowledgeStore.deleteByTag((payload as { tag: string }).tag) } }
    case MessageType.DELETE_KNOWLEDGE_BY_DOMAIN:
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true, deleted: await knowledgeStore.deleteByDomain((payload as { domain: string }).domain) } }
    case MessageType.CLEAR_KNOWLEDGE:
      await knowledgeStore.clear()
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    case MessageType.EXPORT_KNOWLEDGE:
      return { type: MessageType.RESPONSE, requestId, payload: await knowledgeStore.exportJson() }
    case MessageType.GET_SESSION_MEMORY:
      return { type: MessageType.RESPONSE, requestId, payload: sessionMemory.get() ?? null }
    case MessageType.GET_SYSTEM_MEMORY:
      return { type: MessageType.RESPONSE, requestId, payload: systemMemory.get() ?? null }
    case MessageType.GET_HISTORY: {
      const conversationId = (payload as { conversationId?: string } | undefined)?.conversationId ?? activeConversationId
      const key = historyKey(conversationId)
      const result = await chrome.storage.local.get([key, 'conversationHistory'])
      const history = (result[key] as LLMMessage[]) ?? (conversationId === 'default' ? result.conversationHistory : undefined) ?? []
      return { type: MessageType.RESPONSE, requestId, payload: history }
    }
    case MessageType.CLEAR_HISTORY: {
      const conversationId = (payload as { conversationId?: string } | undefined)?.conversationId ?? activeConversationId
      orchestrator.clearHistory(conversationId)
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    }
    case MessageType.GET_PROVIDERS:
      return { type: MessageType.RESPONSE, requestId, payload: await llmProviderStore.getAllProviders() }
    case MessageType.SET_PROVIDER: {
      const { providerId, config } = payload as { providerId: string; config: ProviderConfig }
      await llmProviderStore.setProvider(providerId, config)
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    }
    case MessageType.REMOVE_PROVIDER: {
      const { providerId } = payload as { providerId: string }
      await llmProviderStore.removeProvider(providerId)
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    }
    case MessageType.GET_GENERAL_SETTINGS:
      return { type: MessageType.RESPONSE, requestId, payload: await generalSettingsStore.getSettings() }
    case MessageType.GET_QUICK_ACTIONS:
      return { type: MessageType.RESPONSE, requestId, payload: await getQuickActions() }
    case MessageType.UPDATE_GENERAL_SETTINGS:
      await generalSettingsStore.updateSettings(payload as Partial<GeneralSettingsConfig>)
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    case MessageType.RESET_GENERAL_SETTINGS:
      await generalSettingsStore.resetToDefaults()
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
    default:
      throw new Error(`Unhandled message type: ${type}`)
  }
}
