import Anthropic from '@anthropic-ai/sdk'
import type { LLMMessage, Tool, LLMResponse, ToolCall } from '@shared/types'
import type { LLMClient, LLMClientOptions, LLMStreamOptions } from './client'

export class ClaudeClient implements LLMClient {
  private anthropic: Anthropic
  private model: string

  constructor({ apiKey, model }: LLMClientOptions) {
    this.anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
    this.model = model
  }

  async chat(messages: LLMMessage[], tools: Tool[] = [], _options: { signal?: AbortSignal } = {}): Promise<LLMResponse> {
    const systemMsg = messages.find(m => m.role === 'system')
    const anthropicMessages = messages.filter(m => m.role !== 'system').map(m => {
      if (m.role === 'tool' && !m.toolCallId) {
        throw new Error('Tool messages must include toolCallId')
      }
      return {
        role: m.role === 'tool' ? ('user' as const) : (m.role as 'user' | 'assistant'),
        content: m.role === 'tool'
          ? [{ type: 'tool_result' as const, tool_use_id: m.toolCallId!, content: m.content }]
          : m.content,
      }
    })

    const anthropicTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
        ),
      },
    }))

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 4096,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: anthropicMessages,
      ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
    })

    const toolCalls: ToolCall[] = response.content
      .filter(b => b.type === 'tool_use')
      .map(b => {
        const tb = b as { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        return { id: tb.id, name: tb.name, params: tb.input }
      })

    const textBlock = response.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined
    return {
      content: textBlock?.text ?? '',
      toolCalls,
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use'
        : response.stop_reason === 'max_tokens' ? 'max_tokens'
        : 'end_turn',
    }
  }

  async streamChat(messages: LLMMessage[], tools: Tool[] = [], options: LLMStreamOptions = {}): Promise<LLMResponse> {
    // Anthropic streaming with tool use has provider-specific block assembly; keep the
    // normal response path as a safe fallback while still exposing the streaming contract.
    const response = await this.chat(messages, tools, { signal: options.signal })
    if (response.content) options.onChunk?.(response.content)
    return response
  }

}
