import type { AgentDef, GlobalConfig, SkillDef, Tool } from '@shared/types'
import { AgentRuntime } from './agent-runtime'
import { getLLMClient } from './llm/client'

interface OrchestratorOptions {
  getApiKey: (provider: string) => Promise<string>
  getConfig: () => Promise<GlobalConfig>
  executeToolCall: (tool: string, params: Record<string, unknown>) => Promise<unknown>
  listAgents: () => Promise<AgentDef[]>
  listSkills: (names: string[]) => Promise<SkillDef[]>
}

export class Orchestrator {
  private options: OrchestratorOptions

  constructor(options: OrchestratorOptions) {
    this.options = options
  }

  async handleUserMessage(taskId: string, message: string): Promise<string> {
    const { getApiKey, getConfig, executeToolCall, listAgents, listSkills } = this.options
    const config = await getConfig()
    const agents = await listAgents()
    const agent = agents[0] ?? this.defaultAgent(config)

    const provider = agent.llm.toLowerCase().startsWith('gpt') ? 'openai'
      : agent.llm.toLowerCase().startsWith('gemini') ? 'gemini'
      : agent.llm.toLowerCase().startsWith('deepseek') ? 'deepseek'
      : agent.llm.toLowerCase().startsWith('qwen') ? 'qwen'
      : 'claude'

    const apiKey = await getApiKey(provider)
    const client = getLLMClient(provider, { apiKey, model: agent.llm })

    const skillDefs = await listSkills(agent.skills)
    const tools: Tool[] = skillDefs.map(s => ({
      name: s.name,
      description: s.description + (s.instructions ? ' ' + s.instructions : ''),
      parameters: Object.fromEntries(
        Object.entries(s.parameters).map(([k, v]) => [k, { type: v, description: k }])
      ),
    }))

    const runtime = new AgentRuntime({ agent, client, executeToolCall, maxToolCalls: config.maxToolCallsPerTask, tools })
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
