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
