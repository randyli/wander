import type { LLMMessage, Tool, LLMResponse } from '@shared/types'

export interface LLMClientOptions {
  apiKey: string
  model: string
}

export interface LLMClient {
  chat(messages: LLMMessage[], tools?: Tool[]): Promise<LLMResponse>
}

export function getLLMClient(provider: string, options: LLMClientOptions): LLMClient {
  if (provider === 'claude') {
    const { ClaudeClient } = require('./claude') as typeof import('./claude')
    return new ClaudeClient(options)
  }
  if (provider === 'openai') {
    const { OpenAIClient } = require('./openai') as typeof import('./openai')
    return new OpenAIClient(options)
  }
  if (provider === 'gemini') {
    const { GeminiClient } = require('./gemini') as typeof import('./gemini')
    return new GeminiClient(options)
  }
  throw new Error(`Unknown LLM provider: ${provider}`)
}
