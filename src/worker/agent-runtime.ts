import type { AgentDef, LLMMessage, Tool } from '@shared/types'
import type { LLMClient } from './llm/client'

interface AgentRuntimeOptions {
  agent: AgentDef
  client: LLMClient
  executeToolCall: (tool: string, params: Record<string, unknown>) => Promise<unknown>
  maxToolCalls: number
  tools?: Tool[]
}

export interface RunResult {
  content: string
  thinking: string  // reasoning + tool steps
}

export class AgentRuntime {
  private options: AgentRuntimeOptions

  constructor(options: AgentRuntimeOptions) {
    this.options = options
  }

  async run(userMessage: string, _taskId: string, history: LLMMessage[] = []): Promise<RunResult> {
    const { agent, client, executeToolCall, maxToolCalls } = this.options
    const messages: LLMMessage[] = [
      { role: 'system', content: agent.systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ]
    const tools: Tool[] = this.options.tools ?? agent.skills.map(name => ({
      name,
      description: `Execute skill: ${name}`,
      parameters: {},
    }))

    const thinkingParts: string[] = []
    let toolCallCount = 0

    while (true) {
      console.log('[AgentRuntime] sending to LLM →', JSON.stringify({ messages, tools }, null, 2))
      const response = await client.chat(messages, tools)
      console.log('[AgentRuntime] LLM response ←', JSON.stringify(response, null, 2))

      if (response.thinking) {
        thinkingParts.push(`**Reasoning**\n${response.thinking}`)
      }

      if (response.stopReason === 'end_turn' || response.toolCalls.length === 0) {
        return { content: response.content, thinking: thinkingParts.join('\n\n---\n\n') }
      }

      messages.push({
        role: 'assistant',
        content: response.content,
        rawToolCalls: (response.rawAssistantMessage as { tool_calls?: unknown })?.tool_calls,
      })

      for (const toolCall of response.toolCalls) {
        if (toolCallCount >= maxToolCalls) {
          throw new Error(`Max tool calls (${maxToolCalls}) exceeded`)
        }
        toolCallCount++
        const result = await executeToolCall(toolCall.name, toolCall.params)
        const payload = (result as { payload?: { result?: unknown; error?: string } })?.payload
        const unwrapped = payload?.error ? `Error: ${payload.error}` : (payload?.result ?? result)
        const raw = typeof unwrapped === 'string' ? unwrapped : JSON.stringify(unwrapped)
        const content = raw.startsWith('data:image/')
          ? '[Screenshot taken, but this is a text-only model and cannot process images. Use dom_getText to read page content instead.]'
          : raw.length > 8000 ? raw.slice(0, 8000) + '...[truncated]' : raw

        thinkingParts.push(`**Tool: \`${toolCall.name}\`**\nParams: \`${JSON.stringify(toolCall.params)}\`\nResult: ${content}`)

        messages.push({
          role: 'tool',
          content,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        })
      }
    }
  }
}
