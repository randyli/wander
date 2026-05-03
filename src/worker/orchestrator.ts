import type { AgentDef, GlobalConfig, LLMMessage, SkillDef, Tool } from '@shared/types'
import { AgentRuntime } from './agent-runtime'
import type { RunResult } from './agent-runtime'
import { getLLMClient } from './llm/client'
import type { SessionMemoryManager } from './memory/session'
import type { SystemMemoryManager } from './memory/system'

interface OrchestratorOptions {
  getApiKey: (provider: string) => Promise<string>
  getConfig: () => Promise<GlobalConfig>
  executeToolCall: (tool: string, params: Record<string, unknown>) => Promise<unknown>
  listAgents: () => Promise<AgentDef[]>
  listSkills: (names: string[]) => Promise<SkillDef[]>
  loadHistory: () => Promise<LLMMessage[]>
  saveHistory: (history: LLMMessage[]) => Promise<void>
  sessionMemory: SessionMemoryManager
  systemMemory: SystemMemoryManager
}

const MAX_HISTORY = 100

function detectProvider(model: string): string {
  const m = model.toLowerCase()
  if (m.startsWith('gpt')) return 'openai'
  if (m.startsWith('gemini')) return 'gemini'
  if (m.startsWith('deepseek')) return 'deepseek'
  if (m.startsWith('qwen')) return 'qwen'
  return 'claude'
}

function buildTools(skillDefs: SkillDef[]): Tool[] {
  return skillDefs.map(s => ({
    name: s.tool.replace(/\./g, '_'),
    description: s.description + (s.instructions ? ' ' + s.instructions : ''),
    parameters: Object.fromEntries(
      Object.entries(s.parameters).map(([k, v]) => [k, { type: v, description: k }])
    ),
  }))
}

function buildMemoryContext(sys: SystemMemoryManager, sess: SessionMemoryManager): string {
  const parts = [sys.getContextString(), sess.getContextString()].filter(Boolean)
  return parts.length ? '\n\n## Memory Context\n' + parts.join('\n\n') : ''
}

function withMemory(agent: AgentDef, memoryContext: string): AgentDef {
  if (!memoryContext) return agent
  return { ...agent, systemPrompt: agent.systemPrompt + memoryContext }
}

export class Orchestrator {
  private options: OrchestratorOptions
  private history: LLMMessage[] | null = null

  constructor(options: OrchestratorOptions) {
    this.options = options
  }

  async handleUserMessage(taskId: string, message: string): Promise<RunResult> {
    const { getApiKey, getConfig, executeToolCall, listAgents, listSkills, sessionMemory, systemMemory } = this.options

    if (this.history === null) {
      this.history = await this.options.loadHistory()
    }

    const config = await getConfig()
    const allAgents = await listAgents()
    const orchestratorAgent = allAgents[0] ?? this.defaultAgent(config)
    const subAgents = allAgents.slice(1)

    const provider = detectProvider(orchestratorAgent.llm)
    const apiKey = await getApiKey(provider)
    const client = getLLMClient(provider, { apiKey, model: orchestratorAgent.llm })

    const memoryContext = buildMemoryContext(systemMemory, sessionMemory)
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
      })
    }

    const self = this
    const wrappedExecuteToolCall = async (toolName: string, params: Record<string, unknown>): Promise<unknown> => {
      if (toolName === 'agent_call') {
        const { agent_name, task } = params as { agent_name: string; task: string }
        return self.runSubAgent(agent_name, task, allAgents, config, memoryContext)
      }
      return executeToolCall(toolName, params)
    }

    const runtime = new AgentRuntime({
      agent: agentWithMemory,
      client,
      executeToolCall: wrappedExecuteToolCall,
      maxToolCalls: config.maxToolCallsPerTask,
      tools,
    })
    const result = await runtime.run(message, taskId, this.history)

    this.history.push({ role: 'user', content: message })
    this.history.push({ role: 'assistant', content: result.content })
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(-MAX_HISTORY)
    }
    await this.options.saveHistory(this.history)

    // Fire-and-forget: update session memory without blocking
    sessionMemory.infer(this.history, client).catch(() => {})

    return result
  }

  private async runSubAgent(
    agentName: string,
    task: string,
    allAgents: AgentDef[],
    config: GlobalConfig,
    memoryContext: string,
  ): Promise<string> {
    const subAgent = allAgents.find(a => a.name === agentName)
    if (!subAgent) throw new Error(`Sub-agent not found: "${agentName}". Available: ${allAgents.slice(1).map(a => a.name).join(', ')}`)

    const provider = detectProvider(subAgent.llm)
    const apiKey = await this.options.getApiKey(provider)
    const client = getLLMClient(provider, { apiKey, model: subAgent.llm })

    const skillDefs = await this.options.listSkills(subAgent.skills)
    const tools = buildTools(skillDefs)

    const runtime = new AgentRuntime({
      agent: withMemory(subAgent, memoryContext),
      client,
      executeToolCall: this.options.executeToolCall,
      maxToolCalls: config.maxToolCallsPerTask,
      tools,
    })
    const result = await runtime.run(task, crypto.randomUUID())
    return result.content
  }

  clearHistory(): void {
    this.history = []
    this.options.sessionMemory.clear()
    this.options.saveHistory([])
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
