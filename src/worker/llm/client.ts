import type { LLMMessage, Tool, LLMResponse } from '@shared/types'
import { ClaudeClient } from './claude'
import { OpenAIClient } from './openai'
import { GeminiClient } from './gemini'
import { DeepSeekClient } from './deepseek'
import { QwenClient } from './qwen'

export interface LLMClientOptions {
  apiKey: string
  model: string
}

export interface LLMStreamOptions {
  signal?: AbortSignal
  onChunk?: (chunk: string) => void
}

export interface LLMClient {
  chat(messages: LLMMessage[], tools?: Tool[], options?: { signal?: AbortSignal }): Promise<LLMResponse>
  streamChat?(messages: LLMMessage[], tools?: Tool[], options?: LLMStreamOptions): Promise<LLMResponse>
}

export async function streamWithFallback(
  client: LLMClient,
  messages: LLMMessage[],
  tools: Tool[] = [],
  options: LLMStreamOptions = {},
): Promise<LLMResponse> {
  if (client.streamChat) return client.streamChat(messages, tools, options)
  const response = await client.chat(messages, tools, { signal: options.signal })
  if (response.content) options.onChunk?.(response.content)
  return response
}

export function getLLMClient(provider: string, options: LLMClientOptions): LLMClient {
  if (provider === 'claude') return new ClaudeClient(options)
  if (provider === 'openai') return new OpenAIClient(options)
  if (provider === 'gemini') return new GeminiClient(options)
  if (provider === 'deepseek') return new DeepSeekClient(options)
  if (provider === 'qwen') return new QwenClient(options)
  throw new Error(`Unknown LLM provider: ${provider}`)
}
