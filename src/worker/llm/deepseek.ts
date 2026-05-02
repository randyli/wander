import OpenAI from 'openai'
import type { LLMMessage, Tool, LLMResponse, ToolCall } from '@shared/types'
import type { LLMClient, LLMClientOptions } from './client'

export class DeepSeekClient implements LLMClient {
  private openai: OpenAI
  private model: string

  constructor({ apiKey, model }: LLMClientOptions) {
    this.openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
      dangerouslyAllowBrowser: true,
    })
    this.model = model
  }

  async chat(messages: LLMMessage[], tools: Tool[] = []): Promise<LLMResponse> {
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
      return { role: m.role as 'system' | 'user' | 'assistant', content: m.content }
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
    })

    const choice = response.choices[0]
    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      params: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }))

    const reasoning = (choice.message as unknown as { reasoning_content?: string }).reasoning_content

    return {
      content: choice.message.content ?? '',
      toolCalls,
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use'
        : choice.finish_reason === 'length' ? 'max_tokens'
        : 'end_turn',
      thinking: reasoning || undefined,
      rawAssistantMessage: choice.finish_reason === 'tool_calls' ? choice.message : undefined,
    }
  }
}
