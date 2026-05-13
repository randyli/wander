import type { TaskEventPayload } from '@shared/messages'
import type { AgentDef, LLMMessage, Tool } from '@shared/types'
import { streamWithFallback } from './llm/client'
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
  signal?: AbortSignal
  onStreamChunk?: (chunk: string) => void
}

export interface RunResult {
  content: string
  thinking: string  // reasoning + tool steps
}

interface NormalizedToolResult {
  ok: boolean
  result: unknown
  errorCode?: string
  errorMessage?: string
}

function classifyToolError(value: unknown): { errorCode: string; errorMessage: string } {
  const message = value instanceof Error ? value.message : String(value)
  const explicitCode = (value as { code?: unknown })?.code
  if (typeof explicitCode === 'string' && explicitCode) return { errorCode: explicitCode, errorMessage: message }

  if (/element not found|form not found/i.test(message)) return { errorCode: 'ELEMENT_NOT_FOUND', errorMessage: message }
  if (/not visible/i.test(message)) return { errorCode: 'ELEMENT_NOT_VISIBLE', errorMessage: message }
  if (/timeout|timed out/i.test(message)) return { errorCode: 'TOOL_TIMEOUT', errorMessage: message }
  if (/cannot execute tools|restricted|chrome:\/\/|chrome-extension:\/\//i.test(message)) return { errorCode: 'RESTRICTED_URL', errorMessage: message }
  if (/page is still loading|page.*not.*loaded|receiving end does not exist|could not establish connection/i.test(message)) return { errorCode: 'PAGE_NOT_LOADED', errorMessage: message }
  if (/captcha|cloudflare|verify you are human|access denied|403/i.test(message)) return { errorCode: 'CAPTCHA_OR_CLOUDFLARE', errorMessage: message }
  return { errorCode: 'TOOL_ERROR', errorMessage: message }
}

function normalizeToolResult(result: unknown): NormalizedToolResult {
  const maybeMessage = result as { payload?: unknown }
  const candidate = maybeMessage?.payload ?? result
  const structured = candidate as { ok?: unknown; result?: unknown; error?: unknown; errorCode?: unknown; errorMessage?: unknown }

  if (structured?.ok === false) {
    const nestedError = structured.error as { code?: unknown; message?: unknown } | undefined
    const errorCode = typeof structured.errorCode === 'string' ? structured.errorCode
      : typeof nestedError?.code === 'string' ? nestedError.code
      : classifyToolError(structured.errorMessage ?? nestedError?.message ?? structured.error ?? 'Tool failed').errorCode
    const errorMessage = typeof structured.errorMessage === 'string' ? structured.errorMessage
      : typeof nestedError?.message === 'string' ? nestedError.message
      : typeof structured.error === 'string' ? structured.error
      : 'Tool failed'
    return { ok: false, result: structured.result ?? null, errorCode, errorMessage }
  }

  if (typeof structured?.error === 'string') {
    const classified = classifyToolError(structured.error)
    return { ok: false, result: structured.result ?? null, ...classified }
  }

  if (structured?.ok === true && 'result' in structured) {
    return { ok: true, result: structured.result }
  }

  return { ok: true, result: candidate }
}

function formatToolErrorForModel(tool: string, errorCode: string, errorMessage: string): string {
  return JSON.stringify({ ok: false, errorCode, errorMessage, tool })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Task cancelled')
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
    const { agent, client, executeToolCall, maxToolCalls, emitTaskEvent, signal, onStreamChunk } = this.options
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
      throwIfAborted(signal)
      console.log('[AgentRuntime] sending to LLM →', JSON.stringify({ messages, tools }, null, 2))
      const response = await streamWithFallback(client, messages, tools, { signal, onChunk: onStreamChunk })
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
        throwIfAborted(signal)
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
          throwIfAborted(signal)
        } catch (err) {
          const classified = classifyToolError(err)
          result = { ok: false, result: null, ...classified }
        }
        const normalized = normalizeToolResult(result)
        wm?.logToolCall(taskId, toolCall.name, toolCall.params, normalized)
        const unwrapped = normalized.ok
          ? normalized.result
          : formatToolErrorForModel(toolCall.name, normalized.errorCode ?? 'TOOL_ERROR', normalized.errorMessage ?? 'Tool failed')
        const raw = typeof unwrapped === 'string' ? unwrapped : JSON.stringify(unwrapped)
        const content = raw.startsWith('data:image/')
          ? '[Screenshot taken, but this is a text-only model and cannot process images. Use dom_getText to read page content instead.]'
          : raw.length > 8000 ? raw.slice(0, 8000) + '...[truncated]' : raw

        emitTaskEvent?.({
          taskId,
          agentName: agent.name,
          eventType: normalized.ok ? 'tool_complete' : 'tool_error',
          toolName: toolCall.name,
          params: toolCall.params,
          status: normalized.ok ? 'success' : 'error',
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
