import { MessageType } from '@shared/messages'
import type { LLMMessage, ProviderConfig, GeneralSettingsConfig } from '@shared/types'
import { llmProviderStore, generalSettingsStore } from '../storage'
import { Orchestrator } from './orchestrator'
import { SkillRegistry } from './skill-registry'
import { AgentRegistry } from './agent-registry'
import { EpisodicMemory } from './memory/episodic'
import { KnowledgeStore } from './memory/knowledge'
import { SessionMemoryManager } from './memory/session'
import { SystemMemoryManager } from './memory/system'
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
let orchestrator: Orchestrator
let initPromise: Promise<void> | null = null

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
        defaultProvider: settings.defaultProvider,
        defaultModel: settings.defaultModel,
        maxToolCallsPerTask: settings.maxToolCallsPerTask,
        maxEpisodes: settings.maxEpisodes,
      }
    },
    loadHistory: async () => {
      const result = await chrome.storage.local.get('conversationHistory')
      return (result.conversationHistory as LLMMessage[]) ?? []
    },
    saveHistory: async (history) => {
      await chrome.storage.local.set({ conversationHistory: history })
    },
    executeToolCall: async (toolLlm, params) => {
      const tool = toolLlm.replace(/_/g, '.')
      if (tool === 'history.search') {
        const { query = '', max_results = '20', days_back = '7' } = params as { query?: string; max_results?: string; days_back?: string }
        const startTime = Date.now() - Number(days_back) * 24 * 60 * 60 * 1000
        const items = await chrome.history.search({ text: query, startTime, maxResults: Number(max_results) })
        return items.map(h => ({ title: h.title, url: h.url, lastVisit: new Date(h.lastVisitTime ?? 0).toLocaleString() }))
      }
      if (tool === 'memory.set') {
        const { key, value, tags } = params as { key: string; value: string; tags?: string }
        await knowledgeStore.set(key, value, tags ? tags.split(',').map(t => t.trim()) : [])
        return { ok: true }
      }
      if (tool === 'memory.get') {
        const { key } = params as { key: string }
        const entry = await knowledgeStore.get(key)
        return entry ? entry.value : null
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active tab')
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
              resolve()
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
  init().then(() => triggerSystemMemoryBuild())
})

function triggerSystemMemoryBuild() {
  generalSettingsStore.getSettings().then(async (settings) => {
    const provider = settings.defaultModel.toLowerCase().startsWith('gpt') ? 'openai'
      : settings.defaultModel.toLowerCase().startsWith('gemini') ? 'gemini'
      : settings.defaultModel.toLowerCase().startsWith('deepseek') ? 'deepseek'
      : settings.defaultModel.toLowerCase().startsWith('qwen') ? 'qwen'
      : 'claude'
    const config = await llmProviderStore.getProvider(provider)
    const key = config?.apiKey ?? ''
    if (!key) return
    const { getLLMClient } = await import('./llm/client')
    const client = getLLMClient(provider, { apiKey: key, model: settings.defaultModel })
    systemMemory.buildIfStale(client).catch(() => {})
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

async function handleMessage(message: { type: MessageType; requestId: string; payload?: unknown }): Promise<unknown> {
  const { type, requestId, payload } = message

  switch (type) {
    case MessageType.USER_MESSAGE: {
      const { text } = payload as { text: string }
      const result = await orchestrator.handleUserMessage(crypto.randomUUID(), text)
      return { type: MessageType.AGENT_MESSAGE, requestId, payload: { text: result.content, thinking: result.thinking, agentName: 'assistant' } }
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
    case MessageType.GET_SESSION_MEMORY:
      return { type: MessageType.RESPONSE, requestId, payload: sessionMemory.get() ?? null }
    case MessageType.GET_SYSTEM_MEMORY:
      return { type: MessageType.RESPONSE, requestId, payload: systemMemory.get() ?? null }
    case MessageType.GET_HISTORY: {
      const result = await chrome.storage.local.get('conversationHistory')
      return { type: MessageType.RESPONSE, requestId, payload: result.conversationHistory ?? [] }
    }
    case MessageType.CLEAR_HISTORY:
      orchestrator.clearHistory()
      return { type: MessageType.RESPONSE, requestId, payload: { ok: true } }
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
