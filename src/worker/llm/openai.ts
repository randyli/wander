import OpenAI from 'openai'
import type { LLMMessage, Tool, LLMResponse, ToolCall } from '@shared/types'
import type { LLMClient, LLMClientOptions } from './client'

export class OpenAIClient implements LLMClient {
  private openai: OpenAI
  private model: string

  constructor({ apiKey, model }: LLMClientOptions) {
    this.openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
    this.model = model
  }

  async chat(messages: LLMMessage[], tools: Tool[] = []): Promise<LLMResponse> {
    const oaiMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'tool',
      content: m.content,
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      ...(m.toolName ? { name: m.toolName } : {}),
    }))

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

    return {
      content: choice.message.content ?? '',
      toolCalls,
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use'
        : choice.finish_reason === 'length' ? 'max_tokens'
        : 'end_turn',
    }
  }
}
