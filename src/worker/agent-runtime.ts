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
