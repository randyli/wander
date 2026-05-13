import OpenAI from 'openai'
import type { LLMMessage, Tool, LLMResponse, ToolCall } from '@shared/types'
import type { LLMClient, LLMClientOptions, LLMStreamOptions } from './client'

export class QwenClient implements LLMClient {
  private openai: OpenAI
  private model: string

  constructor({ apiKey, model }: LLMClientOptions) {
    this.openai = new OpenAI({
      apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      dangerouslyAllowBrowser: true,
    })
    this.model = model
  }

  async chat(messages: LLMMessage[], tools: Tool[] = [], options: { signal?: AbortSignal } = {}): Promise<LLMResponse> {
    const oaiMessages = messages.map((m): OpenAI.Chat.ChatCompletionMessageParam => {
      if (m.role === 'tool') {
        return { role: 'tool' as const, tool_call_id: m.toolCallId!, content: m.content }
      }
      if (m.role === 'assistant' && m.rawToolCalls) {
        return {
          role: 'assistant' as const,
          content: m.content,
          tool_calls: m.rawToolCalls as OpenAI.Chat.ChatCompletionMessageToolCall[],
        }
      }
      return { role: m.role as 'user' | 'assistant', content: m.content }
    })

    const oaiTools = tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
          ),
        },
      },
    }))

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: oaiMessages,
      ...(oaiTools.length > 0 ? { tools: oaiTools } : {}),
    }, { signal: options.signal })

    const choice = response.choices[0]
    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      params: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }))

    return {
      content: choice.message.content ?? '',
      toolCalls,
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use'
        : choice.finish_reason === 'length' ? 'max_tokens'
        : 'end_turn',
      rawAssistantMessage: choice.finish_reason === 'tool_calls' ? choice.message : undefined,
    }
  }

  async streamChat(messages: LLMMessage[], tools: Tool[] = [], options: LLMStreamOptions = {}): Promise<LLMResponse> {
    // Tool calls are easier to handle deterministically with the normal response path; keep
    // streaming for text-only turns and fall back when tools are available.
    if (tools.length > 0) {
      const response = await this.chat(messages, tools, { signal: options.signal })
      if (response.content) options.onChunk?.(response.content)
      return response
    }

    const oaiMessages = messages.map((m): OpenAI.Chat.ChatCompletionMessageParam => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }))

    const stream = await this.openai.chat.completions.create({
      model: this.model,
      messages: oaiMessages,
      stream: true,
    }, { signal: options.signal })

    let content = ''
    let finishReason: string | null = null
    for await (const part of stream) {
      if (options.signal?.aborted) throw new Error('Task cancelled')
      const delta = part.choices[0]?.delta?.content ?? ''
      finishReason = part.choices[0]?.finish_reason ?? finishReason
      if (delta) {
        content += delta
        options.onChunk?.(delta)
      }
    }

    return {
      content,
      toolCalls: [],
      stopReason: finishReason === 'length' ? 'max_tokens' : 'end_turn',
    }
  }

}
