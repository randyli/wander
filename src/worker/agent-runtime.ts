import type { TaskEventPayload } from '@shared/messages'
import type { AgentDef, LLMMessage, Tool } from '@shared/types'
import type { LLMClient } from './llm/client'
import type { WorkingMemoryManager } from './memory/working'

interface AgentRuntimeOptions {
  agent: AgentDef
  client: LLMClient
  executeToolCall: (tool: string, params: Record<string, unknown>) => Promise<unknown>
  maxToolCalls: number
  tools?: Tool[]
  workingMemory?: WorkingMemoryManager
  emitTaskEvent?: (event: TaskEventPayload) => void
}

export interface RunResult {
  content: string
  thinking: string  // reasoning + tool steps
}

function summarizeValue(value: unknown, maxLength = 600): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  if (!raw) return ''
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}… [truncated ${raw.length - maxLength} chars]` : raw
}

export class AgentRuntime {
  private options: AgentRuntimeOptions

  constructor(options: AgentRuntimeOptions) {
    this.options = options
  }

  async run(userMessage: string, taskId: string, history: LLMMessage[] = []): Promise<RunResult> {
    const { agent, client, executeToolCall, maxToolCalls, emitTaskEvent } = this.options
    const messages: LLMMessage[] = [
      { role: 'system', content: agent.systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ]
    const tools: Tool[] = this.options.tools ?? agent.skills.map(name => ({
      name,
      description: `Execute skill: ${name}`,
      parameters: {},
      risk: 'read',
    }))

    const thinkingParts: string[] = []
    let toolCallCount = 0

    while (true) {
      console.log('[AgentRuntime] sending to LLM →', JSON.stringify({ messages, tools }, null, 2))
      const response = await client.chat(messages, tools)
      console.log('[AgentRuntime] LLM response ←', JSON.stringify(response, null, 2))
      emitTaskEvent?.({
        taskId,
        agentName: agent.name,
        eventType: 'llm_response',
        status: response.stopReason === 'end_turn' || response.toolCalls.length === 0 ? 'success' : 'running',
        summary: summarizeValue(response.content || response.thinking || `${response.toolCalls.length} tool call(s) requested`),
      })

      if (response.thinking) {
        thinkingParts.push(`**Reasoning**\n${response.thinking}`)
      }

      if (response.stopReason === 'end_turn' || response.toolCalls.length === 0) {
        emitTaskEvent?.({
          taskId,
          agentName: agent.name,
          eventType: 'final_response',
          status: 'success',
          summary: summarizeValue(response.content),
        })
        return { content: response.content, thinking: thinkingParts.join('\n\n---\n\n') }
      }

      messages.push({
        role: 'assistant',
        content: response.content,
        rawToolCalls: (response.rawAssistantMessage as { tool_calls?: unknown })?.tool_calls,
      })

      const wm = this.options.workingMemory
      wm?.appendMessage(taskId, { role: 'assistant', content: response.content })

      for (const toolCall of response.toolCalls) {
        if (toolCallCount >= maxToolCalls) {
          throw new Error(`Max tool calls (${maxToolCalls}) exceeded`)
        }
        toolCallCount++
        emitTaskEvent?.({
          taskId,
          agentName: agent.name,
          eventType: 'tool_start',
          toolName: toolCall.name,
          params: toolCall.params,
          status: 'running',
          summary: `Calling ${toolCall.name}`,
        })
        let result: unknown
        try {
          result = await executeToolCall(toolCall.name, toolCall.params)
        } catch (err) {
          emitTaskEvent?.({
            taskId,
            agentName: agent.name,
            eventType: 'tool_error',
            toolName: toolCall.name,
            params: toolCall.params,
            status: 'error',
            summary: err instanceof Error ? err.message : String(err),
          })
          throw err
        }
        wm?.logToolCall(taskId, toolCall.name, toolCall.params, result)
        const payload = (result as { payload?: { result?: unknown; error?: string } })?.payload
        const unwrapped = payload?.error ? `Error: ${payload.error}` : (payload?.result ?? result)
        const raw = typeof unwrapped === 'string' ? unwrapped : JSON.stringify(unwrapped)
        const content = raw.startsWith('data:image/')
          ? '[Screenshot taken, but this is a text-only model and cannot process images. Use dom_getText to read page content instead.]'
          : raw.length > 8000 ? raw.slice(0, 8000) + '...[truncated]' : raw

        emitTaskEvent?.({
          taskId,
          agentName: agent.name,
          eventType: payload?.error ? 'tool_error' : 'tool_complete',
          toolName: toolCall.name,
          params: toolCall.params,
          status: payload?.error ? 'error' : 'success',
          summary: summarizeValue(unwrapped),
        })

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
