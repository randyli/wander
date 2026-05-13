import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import type { LLMMessage, Tool, LLMResponse, ToolCall } from '@shared/types'
import type { LLMClient, LLMClientOptions, LLMStreamOptions } from './client'

export class GeminiClient implements LLMClient {
  private genAI: GoogleGenerativeAI
  private model: string

  constructor({ apiKey, model }: LLMClientOptions) {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.model = model
  }

  async chat(messages: LLMMessage[], tools: Tool[] = [], _options: { signal?: AbortSignal } = {}): Promise<LLMResponse> {
    const systemMsg = messages.find(m => m.role === 'system')
    const geminiModel = this.genAI.getGenerativeModel({
      model: this.model,
      ...(systemMsg ? { systemInstruction: systemMsg.content } : {}),
    })

    const history = messages.filter(m => m.role !== 'system').slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const lastMessage = messages.filter(m => m.role !== 'system').at(-1)!

    const functionDeclarations = tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([k, v]) => [k, { type: (v.type === 'string' ? SchemaType.STRING : SchemaType.OBJECT), description: v.description }])
        ),
      },
    }))

    const contents = [...history, { role: 'user', parts: [{ text: lastMessage.content }] }]
    const result = await geminiModel.generateContent(
      functionDeclarations.length > 0
        ? { contents, tools: [{ functionDeclarations }] }
        : { contents }
    )

    const response = result.response
    const functionCalls = response.functionCalls?.() ?? []
    const toolCalls: ToolCall[] = functionCalls.map((fc, i) => ({
      id: `gemini_call_${Date.now()}_${i}`,
      name: fc.name,
      params: fc.args as Record<string, unknown>,
    }))

    return {
      content: response.text(),
      toolCalls,
      stopReason: functionCalls.length > 0 ? 'tool_use' : 'end_turn',
    }
  }

  async streamChat(messages: LLMMessage[], tools: Tool[] = [], options: LLMStreamOptions = {}): Promise<LLMResponse> {
    // Gemini function-calling chunks require provider-specific reconstruction; use the
    // stable non-streaming path when tools are present and emit the final text chunk.
    const response = await this.chat(messages, tools, { signal: options.signal })
    if (response.content) options.onChunk?.(response.content)
    return response
  }

}
