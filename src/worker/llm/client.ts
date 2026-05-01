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

export interface LLMClient {
  chat(messages: LLMMessage[], tools?: Tool[]): Promise<LLMResponse>
}

export function getLLMClient(provider: string, options: LLMClientOptions): LLMClient {
  if (provider === 'claude') return new ClaudeClient(options)
  if (provider === 'openai') return new OpenAIClient(options)
  if (provider === 'gemini') return new GeminiClient(options)
  if (provider === 'deepseek') return new DeepSeekClient(options)
  if (provider === 'qwen') return new QwenClient(options)
  throw new Error(`Unknown LLM provider: ${provider}`)
}
