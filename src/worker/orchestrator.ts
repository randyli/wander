import type { TaskEventPayload } from '@shared/messages'
import type { AgentDef, GeneralSettingsConfig, LLMMessage, SkillDef, Tool } from '@shared/types'
import { getToolRisk } from './tool-approval'
import { AgentRuntime } from './agent-runtime'
import type { RunResult } from './agent-runtime'
import { getLLMClient } from './llm/client'
import type { SessionMemoryManager } from './memory/session'
import type { SystemMemoryManager } from './memory/system'
import type { WorkingMemoryManager } from './memory/working'
import type { EpisodicMemory } from './memory/episodic'
import type { KnowledgeStore } from './memory/knowledge'

interface OrchestratorOptions {
  getApiKey: (provider: string) => Promise<string>
  getConfig: () => Promise<GeneralSettingsConfig>
  executeToolCall: (tool: string, params: Record<string, unknown>) => Promise<unknown>
  listAgents: () => Promise<AgentDef[]>
  listSkills: (names: string[]) => Promise<SkillDef[]>
  loadHistory: (conversationId?: string) => Promise<LLMMessage[]>
  saveHistory: (history: LLMMessage[], conversationId?: string) => Promise<void>
  sessionMemory: SessionMemoryManager
  systemMemory: SystemMemoryManager
  workingMemory: WorkingMemoryManager
  episodicMemory: EpisodicMemory
  knowledgeStore: KnowledgeStore
  emitTaskEvent?: (event: TaskEventPayload) => void
  emitStreamChunk?: (payload: { taskId: string; conversationId?: string; text: string; done?: boolean }) => void
}

const MAX_HISTORY = 100

function summarizeValue(value: unknown, maxLength = 600): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  if (!raw) return ''
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}… [truncated ${raw.length - maxLength} chars]` : raw
}

function detectProvider(model: string): string {
  const m = model.toLowerCase()
  if (m.startsWith('gpt')) return 'openai'
  if (m.startsWith('gemini')) return 'gemini'
  if (m.startsWith('deepseek')) return 'deepseek'
  if (m.startsWith('qwen')) return 'qwen'
  return 'claude'
}

function parseAgentLlm(llm: string): { provider: string; model: string } {
  if (llm.includes(':')) {
    const [provider, model] = llm.split(':')
    return { provider, model }
  }
  return { provider: detectProvider(llm), model: llm }
}

function buildTools(skillDefs: SkillDef[]): Tool[] {
  return skillDefs.map(s => ({
    name: s.tool.replace(/\./g, '_'),
    description: s.description + (s.instructions ? ' ' + s.instructions : ''),
    parameters: Object.fromEntries(
      Object.entries(s.parameters).map(([k, v]) => [k, { type: v, description: k }])
    ),
    risk: getToolRisk(s.tool),
  }))
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'and', 'or', 'but', 'not', 'this', 'that', 'it', 'its', 'be',
  '的', '了', '是', '在', '和', '也', '就', '都', '而', '及', '与', '着', '或',
  '一个', '没有', '我们', '他们', '你们', '这个', '那个', '什么', '怎么', '如何',
])

function extractKeywords(text: string): string[] {
  return text.split(/[\s,，。！？、；：""''（）()【】\[\]]+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(0, 10)
}

async function buildMemoryContext(
  sys: SystemMemoryManager,
  sess: SessionMemoryManager,
  opts?: { episodicMemory?: EpisodicMemory; knowledgeStore?: KnowledgeStore; userMessage?: string },
): Promise<string> {
  const parts: string[] = []
  const systemContext = sys.getContextString()
  if (systemContext) parts.push(systemContext.startsWith('**Source: system**') ? systemContext : `**Source: system**\n${systemContext}`)

  const sessionContext = sess.getContextString()
  if (sessionContext) parts.push(sessionContext.startsWith('**Source: session**') ? sessionContext : `**Source: session**\n${sessionContext}`)

  if (opts?.userMessage) {
    const keywords = extractKeywords(opts.userMessage)

    if (opts.episodicMemory) {
      const seen = new Set<string>()
      const lines: string[] = []
      for (const kw of keywords) {
        if (lines.length >= 5) break
        const results = await opts.episodicMemory.search(kw)
        for (const ep of results) {
          if (lines.length >= 5) break
          if (!seen.has(ep.id)) {
            seen.add(ep.id)
            lines.push(`- [episode] ${ep.summary} (domain: ${ep.domain}; tags: ${ep.tags.join(', ') || 'none'})`)
          }
        }
      }
      if (lines.length > 0) parts.push(`**Source: episode**\nRelevant history:\n${lines.join('\n')}`)
    }

    if (opts.knowledgeStore) {
      const seen = new Set<string>()
      const lines: string[] = []
      for (const kw of keywords) {
        if (lines.length >= 5) break
        const results = await opts.knowledgeStore.searchByTag(kw)
        for (const entry of results) {
          if (lines.length >= 5) break
          if (!seen.has(entry.key)) {
            seen.add(entry.key)
            const domain = entry.domain ? `; domain: ${entry.domain}` : ''
            lines.push(`- [knowledge] ${entry.key}: ${entry.value.slice(0, 100)} (tags: ${entry.tags.join(', ') || 'none'}${domain})`)
          }
        }
      }
      if (lines.length > 0) parts.push(`**Source: knowledge**\nKnown facts:\n${lines.join('\n')}`)
    }
  }

  return parts.length ? '\n\n## Memory Context\n' + parts.join('\n\n') : ''
}

function withMemory(agent: AgentDef, memoryContext: string): AgentDef {
  if (!memoryContext) return agent
  return { ...agent, systemPrompt: agent.systemPrompt + memoryContext }
}

export class Orchestrator {
  private options: OrchestratorOptions
  private histories = new Map<string, LLMMessage[]>()
  private abortControllers = new Map<string, AbortController>()

  constructor(options: OrchestratorOptions) {
    this.options = options
  }

  async handleUserMessage(taskId: string, message: string, conversationId = 'default'): Promise<RunResult> {
    const { getApiKey, getConfig, executeToolCall, listAgents, listSkills, sessionMemory, systemMemory, workingMemory, episodicMemory, knowledgeStore } = this.options

    if (!this.histories.has(conversationId)) {
      this.histories.set(conversationId, await this.options.loadHistory(conversationId))
    }
    const history = this.histories.get(conversationId)!
    const controller = new AbortController()
    this.abortControllers.set(taskId, controller)

    workingMemory.init(taskId)
    this.options.emitTaskEvent?.({
      taskId,
      agentName: 'user',
      eventType: 'user_message',
      status: 'success',
      summary: summarizeValue(message),
    })

    const config = await getConfig()
    const allAgents = await listAgents()
    const orchestratorAgent = allAgents.find(a => a.name === 'orchestrator')
      ?? allAgents.find(a => a.name === 'orchestrator-agent')
      ?? this.defaultAgent(config)
    const subAgents = allAgents.filter(a => a.name !== orchestratorAgent.name)

    const provider = config.defaultProvider || detectProvider(config.defaultModel)
    const apiKey = await getApiKey(provider)
    const client = getLLMClient(provider, { apiKey, model: config.defaultModel })

    const memoryContext = await buildMemoryContext(systemMemory, sessionMemory, {
      episodicMemory,
      knowledgeStore,
      userMessage: message,
    })
    const agentWithMemory = withMemory(orchestratorAgent, memoryContext)

    const skillDefs = await listSkills(orchestratorAgent.skills)
    const tools: Tool[] = buildTools(skillDefs)

    if (subAgents.length > 0) {
      tools.push({
        name: 'agent_call',
        description: 'Delegate a task to a specialized sub-agent. Available sub-agents:\n' +
          subAgents.map(a => `- ${a.name}: ${a.description}`).join('\n'),
        parameters: {
          agent_name: { type: 'string', description: 'Name of the sub-agent to call' },
          task: { type: 'string', description: 'Detailed task description for the sub-agent' },
        },
        risk: 'read',
      })
    }

    const self = this
    const wrappedExecuteToolCall = async (toolName: string, params: Record<string, unknown>): Promise<unknown> => {
      if (toolName === 'agent_call') {
        const { agent_name, task } = params as { agent_name: string; task: string }
        self.options.emitTaskEvent?.({
          taskId,
          agentName: agent_name,
          eventType: 'subagent_start',
          toolName,
          params,
          status: 'running',
          summary: summarizeValue(task),
        })
        try {
          if (controller.signal.aborted) throw new Error('Task cancelled')
          const result = await self.runSubAgent(agent_name, task, subAgents, config, memoryContext, taskId, controller.signal)
          self.options.emitTaskEvent?.({
            taskId,
            agentName: agent_name,
            eventType: 'subagent_complete',
            toolName,
            params,
            status: 'success',
            summary: summarizeValue(result),
          })
          return result
        } catch (err) {
          self.options.emitTaskEvent?.({
            taskId,
            agentName: agent_name,
            eventType: 'subagent_error',
            toolName,
            params,
            status: 'error',
            summary: err instanceof Error ? err.message : String(err),
          })
          throw err
        }
      }
      if (controller.signal.aborted) throw new Error('Task cancelled')
      return executeToolCall(toolName, params)
    }

    const runtime = new AgentRuntime({
      agent: agentWithMemory,
      client,
      executeToolCall: wrappedExecuteToolCall,
      maxToolCalls: config.maxToolCallsPerTask,
      tools,
      workingMemory,
      emitTaskEvent: this.options.emitTaskEvent,
      signal: controller.signal,
      onStreamChunk: text => this.options.emitStreamChunk?.({ taskId, conversationId, text }),
    })

    try {
      const result = await runtime.run(message, taskId, history)

      history.push({ role: 'user', content: message })
      history.push({ role: 'assistant', content: result.content })
      const trimmedHistory = history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history
      this.histories.set(conversationId, trimmedHistory)
      await this.options.saveHistory(trimmedHistory, conversationId)
      this.options.emitStreamChunk?.({ taskId, conversationId, text: '', done: true })

      // Fire-and-forget: update session memory without blocking
      sessionMemory.infer(trimmedHistory, client).catch(() => {})

      // Fire-and-forget: save episode and trim old history
      this.saveEpisode(message, result).catch(() => {})
      this.summarizeOldHistory(conversationId).catch(() => {})

      return result
    } catch (err) {
      if (controller.signal.aborted) {
        this.options.emitTaskEvent?.({
          taskId,
          agentName: orchestratorAgent.name,
          eventType: 'final_response',
          status: 'cancelled',
          summary: 'Task cancelled',
        })
      }
      throw err
    } finally {
      this.abortControllers.delete(taskId)
      // Cleanup working memory for this task
      workingMemory.clear(taskId)
    }
  }

  private async runSubAgent(
    agentName: string,
    task: string,
    allAgents: AgentDef[],
    config: GeneralSettingsConfig,
    _memoryContext: string,
    parentTaskId?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const subAgent = allAgents.find(a => a.name === agentName)
    if (!subAgent) throw new Error(`Sub-agent not found: "${agentName}". Available: ${allAgents.map(a => a.name).join(', ')}`)

    const { provider, model } = subAgent.llm ? parseAgentLlm(subAgent.llm) : { provider: config.defaultProvider, model: config.defaultModel }
    const apiKey = await this.options.getApiKey(provider)
    const client = getLLMClient(provider, { apiKey, model })

    const skillDefs = await this.options.listSkills(subAgent.skills)
    const tools = buildTools(skillDefs)

    const subMemoryContext = await buildMemoryContext(
      this.options.systemMemory,
      this.options.sessionMemory,
      { episodicMemory: this.options.episodicMemory, knowledgeStore: this.options.knowledgeStore, userMessage: task },
    )

    const subTaskId = crypto.randomUUID()
    this.options.workingMemory.init(subTaskId)

    const runtime = new AgentRuntime({
      agent: withMemory(subAgent, subMemoryContext),
      client,
      executeToolCall: async (tool, params) => {
        if (signal?.aborted) throw new Error('Task cancelled')
        return this.options.executeToolCall(tool, params)
      },
      maxToolCalls: config.maxToolCallsPerTask,
      tools,
      workingMemory: this.options.workingMemory,
      emitTaskEvent: event => this.options.emitTaskEvent?.({ ...event, taskId: parentTaskId ?? event.taskId }),
      signal,
      onStreamChunk: text => this.options.emitStreamChunk?.({ taskId: parentTaskId ?? subTaskId, text }),
    })
    try {
      const result = await runtime.run(task, subTaskId)
      return result.content
    } finally {
      this.options.workingMemory.clear(subTaskId)
    }
  }

  cancelTask(taskId: string): boolean {
    const controller = this.abortControllers.get(taskId)
    if (!controller) return false
    controller.abort()
    return true
  }

  clearHistory(conversationId = 'default'): void {
    this.histories.set(conversationId, [])
    this.options.sessionMemory.clear()
    this.options.saveHistory([], conversationId)
  }

  private defaultAgent(config: GeneralSettingsConfig): AgentDef {
    return {
      name: 'default',
      description: 'Default assistant',
      skills: [],
      llm: config.defaultModel,
      systemPrompt: 'You are a helpful browser assistant. Answer concisely.',
    }
  }

  private async saveEpisode(message: string, result: RunResult): Promise<void> {
    try {
      const { episodicMemory } = this.options
      const summary = `Q: ${message.slice(0, 100)} → ${result.content.slice(0, 100)}`
      const domain = extractKeywords(message)[0] ?? 'general'
      const tags = extractKeywords(message).slice(0, 5)
      await episodicMemory.save({ summary, domain, tags })
      const config = await this.options.getConfig()
      await episodicMemory.evict(config.maxEpisodes)
    } catch { /* fire-and-forget, never fail */ }
  }

  private async summarizeOldHistory(conversationId = 'default'): Promise<void> {
    const history = this.histories.get(conversationId)
    if (!history || history.length < MAX_HISTORY) return
    const oldest = history.slice(0, 30)
    const lines = oldest
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(0, 10)
      .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n')
    if (!lines) return
    try {
      await this.options.episodicMemory.save({
        summary: `History summary: ${lines.slice(0, 200)}`,
        domain: 'conversation',
        tags: ['conversation-summary'],
      })
    } catch { /* fire-and-forget */ }
  }
}
