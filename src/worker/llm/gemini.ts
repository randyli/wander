import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import type { LLMMessage, Tool, LLMResponse, ToolCall } from '@shared/types'
import type { LLMClient, LLMClientOptions } from './client'

export class GeminiClient implements LLMClient {
  private genAI: GoogleGenerativeAI
  private model: string

  constructor({ apiKey, model }: LLMClientOptions) {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.model = model
  }

  async chat(messages: LLMMessage[], tools: Tool[] = []): Promise<LLMResponse> {
    const geminiModel = this.genAI.getGenerativeModel({ model: this.model })

    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const lastMessage = messages[messages.length - 1]

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
}
