import { MessageType } from '@shared/messages'
import type { QuickAction, QuickActionsPayload, TaskEventPayload } from '@shared/messages'
import type { Episode, KnowledgeEntry, LLMMessage, ProviderConfig, GeneralSettingsConfig, QuickActionConfig } from '@shared/types'
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
import polymarketMd from '../../skills/polymarket.md?raw'
import weatherOpenMeteoMd from '../../skills/weather-open-meteo.md?raw'

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


interface RecommendedQuickActionContextItem {
  type: 'history' | 'bookmark' | 'episode' | 'knowledge' | 'profile'
  title?: string
  url?: string
  domain?: string
  summary?: string
  value?: string
  tags?: string[]
  visits?: number
}

const MAX_RECOMMENDED_QUICK_ACTIONS = 5
const MAX_QUICK_ACTION_CONTEXT_ITEMS = 80
const QUICK_ACTION_CONTEXT_LIMITS: Record<RecommendedQuickActionContextItem['type'], number> = {
  history: 30,
  bookmark: 25,
  episode: 12,
  knowledge: 12,
  profile: 1,
}

function truncateQuickActionText(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}

function pushQuickActionContextItem(
  items: RecommendedQuickActionContextItem[],
  item: RecommendedQuickActionContextItem,
  maxItems = MAX_QUICK_ACTION_CONTEXT_ITEMS,
): void {
  if (items.length >= maxItems) return
  items.push(item)
}

function addBookmarkQuickActionContext(
  items: RecommendedQuickActionContextItem[],
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  maxItems = QUICK_ACTION_CONTEXT_LIMITS.bookmark,
): void {
  for (const node of nodes) {
    if (items.length >= maxItems) return
    if (node.url || node.title) {
      pushQuickActionContextItem(items, {
        type: 'bookmark',
        title: truncateQuickActionText(node.title, 120),
        url: truncateQuickActionText(node.url, 160),
      }, maxItems)
    }
    if (node.children) addBookmarkQuickActionContext(items, node.children, maxItems)
  }
}

export function buildRecommendedQuickActionContextItems({
  historyItems,
  bookmarkTree,
  episodes,
  knowledge,
  profile,
}: {
  historyItems: chrome.history.HistoryItem[]
  bookmarkTree: chrome.bookmarks.BookmarkTreeNode[]
  episodes?: Episode[] | null
  knowledge?: KnowledgeEntry[] | null
  profile?: string
}): RecommendedQuickActionContextItem[] {
  const historyContextItems: RecommendedQuickActionContextItem[] = []
  const bookmarkContextItems: RecommendedQuickActionContextItem[] = []
  const episodeContextItems: RecommendedQuickActionContextItem[] = []
  const knowledgeContextItems: RecommendedQuickActionContextItem[] = []
  const profileContextItems: RecommendedQuickActionContextItem[] = []

  for (const item of historyItems) {
    let domain: string | undefined
    if (item.url) {
      try {
        domain = new URL(item.url).hostname
      } catch { /* ignore invalid URLs */ }
    }

    pushQuickActionContextItem(historyContextItems, {
      type: 'history',
      title: truncateQuickActionText(item.title, 120),
      url: truncateQuickActionText(item.url, 160),
      domain,
      visits: item.visitCount,
    }, QUICK_ACTION_CONTEXT_LIMITS.history)
  }

  addBookmarkQuickActionContext(bookmarkContextItems, bookmarkTree)

  for (const episode of episodes ?? []) {
    pushQuickActionContextItem(episodeContextItems, {
      type: 'episode',
      summary: truncateQuickActionText(episode.summary, 240),
      domain: truncateQuickActionText(episode.domain, 120),
      tags: episode.tags?.slice(0, 8),
    }, QUICK_ACTION_CONTEXT_LIMITS.episode)
  }

  for (const entry of knowledge ?? []) {
    pushQuickActionContextItem(knowledgeContextItems, {
      type: 'knowledge',
      title: truncateQuickActionText(entry.key, 120),
      value: truncateQuickActionText(entry.value, 240),
      domain: truncateQuickActionText(entry.domain, 120),
      tags: entry.tags?.slice(0, 8),
    }, QUICK_ACTION_CONTEXT_LIMITS.knowledge)
  }

  const profileSummary = truncateQuickActionText(profile, 500)
  if (profileSummary) {
    pushQuickActionContextItem(profileContextItems, {
      type: 'profile',
      summary: profileSummary,
    }, QUICK_ACTION_CONTEXT_LIMITS.profile)
  }

  return [
    ...historyContextItems,
    ...episodeContextItems,
    ...knowledgeContextItems,
    ...profileContextItems,
    ...bookmarkContextItems,
  ].slice(0, MAX_QUICK_ACTION_CONTEXT_ITEMS)
}

function extractQuickActionJson(content: string): unknown {
  const trimmed = content.trim()
  if (!trimmed) return []

  const fencedJson = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fencedJson?.[1]?.trim() ?? trimmed

  try {
    return JSON.parse(candidate)
  } catch {
    const arrayStart = candidate.indexOf('[')
    const arrayEnd = candidate.lastIndexOf(']')
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(candidate.slice(arrayStart, arrayEnd + 1))
    }

    const objectStart = candidate.indexOf('{')
    const objectEnd = candidate.lastIndexOf('}')
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(candidate.slice(objectStart, objectEnd + 1))
    }

    throw new Error('LLM response did not contain JSON')
  }
}

function normalizeLLMQuickActions(content: string): QuickAction[] {
  const parsed = extractQuickActionJson(content)
  const rawActions = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { actions?: unknown }).actions)
      ? (parsed as { actions: unknown[] }).actions
      : []

  const seen = new Set<string>()
  const actions: QuickAction[] = []
  for (const raw of rawActions) {
    if (typeof raw !== 'object' || raw === null) continue
    const { label, prompt } = raw as { label?: unknown; prompt?: unknown }
    if (typeof label !== 'string' || typeof prompt !== 'string') continue

    const normalizedLabel = truncateQuickActionText(label, 28)
    const normalizedPrompt = truncateQuickActionText(prompt, 400)
    const dedupeKey = normalizedLabel?.toLowerCase()
    if (!normalizedLabel || !normalizedPrompt || !dedupeKey || seen.has(dedupeKey)) continue

    seen.add(dedupeKey)
    actions.push({ label: normalizedLabel, prompt: normalizedPrompt, source: 'recommended' })
    if (actions.length >= MAX_RECOMMENDED_QUICK_ACTIONS) break
  }

  return actions
}

function buildQuickActionRecommendationPrompt(
  contextItems: RecommendedQuickActionContextItem[],
  existingActions: QuickActionConfig[] | undefined,
): LLMMessage[] {
  const enabledExistingLabels = (existingActions ?? [])
    .filter(action => action.enabled !== false && action.label.trim())
    .map(action => action.label.trim())
    .slice(0, 10)

  return [
    {
      role: 'system',
      content: [
        'You generate concise recommended quick-action buttons for a browser assistant.',
        'Base every recommendation on the supplied user context signals.',
        'Return only valid JSON with this shape: {"actions":[{"label":"...","prompt":"..."}]}',
        `Generate up to ${MAX_RECOMMENDED_QUICK_ACTIONS} actions. Labels must be short button text. Prompts must be directly usable instructions for the assistant.`,
        'Use the same language as the dominant context language when clear; otherwise use the user interface language implied by the context.',
        'If contextSignals is empty, return {\"actions\":[]}.',
        'Do not include markdown, explanations, comments, or trailing commas.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        avoidExistingButtonLabels: enabledExistingLabels,
        contextSignals: contextItems,
      }, null, 2),
    },
  ]
}


async function getRecommendedQuickActions(settings?: GeneralSettingsConfig): Promise<QuickAction[]> {
  const currentSettings = settings ?? await generalSettingsStore.getSettings()
  const providerConfig = await llmProviderStore.getProvider(currentSettings.provider)
  const apiKey = providerConfig?.apiKey?.trim()
  if (!apiKey) return []

  const startTime = Date.now() - currentSettings.memoryRetentionDays * 24 * 60 * 60 * 1000
  const maxResults = 50
  const [historyItems, bookmarkTree, episodes, knowledge] = await Promise.all([
    currentSettings.enableHistoryMemory
      ? chrome.history.search({ text: '', startTime, maxResults })
      : Promise.resolve([] as chrome.history.HistoryItem[]),
    currentSettings.enableBookmarkMemory
      ? chrome.bookmarks.getTree()
      : Promise.resolve([] as chrome.bookmarks.BookmarkTreeNode[]),
    episodicMemory?.list?.().catch(() => []),
    knowledgeStore?.list?.().catch(() => []),
  ])

  const contextItems = buildRecommendedQuickActionContextItems({
    historyItems,
    bookmarkTree,
    episodes,
    knowledge,
    profile: systemMemory?.get?.()?.profile,
  })

  try {
    const { getLLMClient } = await import('./llm/client')
    const client = getLLMClient(currentSettings.provider, { apiKey, model: currentSettings.model })
    const response = await client.chat(buildQuickActionRecommendationPrompt(contextItems, currentSettings.quickActions))
    return normalizeLLMQuickActions(response.content)
  } catch (err) {
    console.warn('[QuickActions] Failed to generate recommendations with LLM', err)
    return []
  }
}


interface QuickActionRecommendationCacheEntry {
  key: string
  actions: QuickAction[]
  generatedAt: number
}

let quickActionRecommendationCache: QuickActionRecommendationCacheEntry | null = null
let quickActionRecommendationPromise: Promise<QuickAction[]> | null = null
let quickActionRecommendationPromiseKey: string | null = null

function normalizeConfiguredQuickActions(actions: QuickActionConfig[] | undefined): QuickAction[] {
  if (!Array.isArray(actions)) return []
  return actions
    .filter(action => action.enabled !== false && action.label.trim() && action.prompt.trim())
    .map(action => ({ label: action.label.trim(), prompt: action.prompt.trim(), source: action.source ?? 'user' }))
}

function getQuickActionRecommendationCacheKey(settings: GeneralSettingsConfig): string {
  return JSON.stringify({
    provider: settings.provider,
    model: settings.model,
    enableHistoryMemory: settings.enableHistoryMemory,
    enableBookmarkMemory: settings.enableBookmarkMemory,
    memoryRetentionDays: settings.memoryRetentionDays,
    quickActions: (settings.quickActions ?? []).map(action => ({
      label: action.label,
      enabled: action.enabled !== false,
    })),
  })
}

function hasQuickActionRecommendationCache(settings: GeneralSettingsConfig): boolean {
  if (!quickActionRecommendationCache) return false
  return quickActionRecommendationCache.key === getQuickActionRecommendationCacheKey(settings)
}

function getCachedQuickActionRecommendations(settings: GeneralSettingsConfig): QuickAction[] {
  if (settings.showRecommendedQuickActions === false || !hasQuickActionRecommendationCache(settings)) return []
  return quickActionRecommendationCache?.actions ?? []
}

function buildQuickActionsPayload(settings: GeneralSettingsConfig, recommendations: QuickAction[]): QuickActionsPayload {
  const configured = normalizeConfiguredQuickActions(settings.quickActions)
  const seen = new Set<string>()
  const visibleRecommendations = settings.showRecommendedQuickActions === false ? [] : recommendations
  const actions = [...configured, ...visibleRecommendations].filter(action => {
    const key = action.label.trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    actions: actions.slice(0, 5),
    isExplicitEmpty: configured.length === 0 && settings.showRecommendedQuickActions === false,
  }
}

function emitQuickActionsUpdated(payload: QuickActionsPayload): void {
  try {
    const maybePromise = chrome.runtime.sendMessage({
      type: MessageType.QUICK_ACTIONS_UPDATED,
      requestId: crypto.randomUUID(),
      payload,
    }) as Promise<unknown> | undefined
    maybePromise?.catch?.(() => {})
  } catch {
    // Ignore update broadcasts when no extension view is listening.
  }
}

async function refreshQuickActionRecommendations(settings: GeneralSettingsConfig): Promise<QuickAction[]> {
  if (settings.showRecommendedQuickActions === false) return []
  const cacheKey = getQuickActionRecommendationCacheKey(settings)
  if (quickActionRecommendationPromise && quickActionRecommendationPromiseKey === cacheKey) return quickActionRecommendationPromise

  quickActionRecommendationPromiseKey = cacheKey
  quickActionRecommendationPromise = getRecommendedQuickActions(settings)
    .then(actions => {
      quickActionRecommendationCache = { key: cacheKey, actions, generatedAt: Date.now() }
      emitQuickActionsUpdated(buildQuickActionsPayload(settings, actions))
      return actions
    })
    .catch(err => {
      console.warn('[QuickActions] Failed to refresh recommendations', err)
      return []
    })
    .finally(() => {
      if (quickActionRecommendationPromiseKey === cacheKey) {
        quickActionRecommendationPromise = null
        quickActionRecommendationPromiseKey = null
      }
    })

  return quickActionRecommendationPromise
}

async function getQuickActions(): Promise<QuickActionsPayload> {
  const settings = await generalSettingsStore.getSettings()
  const recommendations = getCachedQuickActionRecommendations(settings)
  return buildQuickActionsPayload(settings, recommendations)
}

async function getQuickActionRecommendations(refresh = false): Promise<QuickActionsPayload> {
  const settings = await generalSettingsStore.getSettings()
  const recommendations = refresh
    ? await refreshQuickActionRecommendations(settings)
    : getCachedQuickActionRecommendations(settings)
  return buildQuickActionsPayload(settings, recommendations)
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
  const builtinSkills = [
    readPageMd,
    takeScreenshotMd,
    navigateMd,
    clickMd,
    fillFormMd,
    memoryReadMd,
    memoryWriteMd,
    readHistoryMd,
    polymarketMd,
    weatherOpenMeteoMd,
  ]
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
    case MessageType.GET_QUICK_ACTION_RECOMMENDATIONS: {
      const refresh = (payload as { refresh?: boolean } | undefined)?.refresh === true
      return { type: MessageType.RESPONSE, requestId, payload: await getQuickActionRecommendations(refresh) }
    }
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
