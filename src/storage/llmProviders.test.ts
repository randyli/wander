import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LLMKeyRecord, ProviderConfig } from './llmProviders'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('llmProviderStore', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('preserves concurrent provider updates when saving the settings page', async () => {
    let stored: LLMKeyRecord | undefined

    vi.mocked(chrome.storage.local.get).mockImplementation(async keys => {
      const storageKey = Array.isArray(keys) ? keys[0] : typeof keys === 'string' ? keys : 'wander_llm_providers'
      await Promise.resolve()
      return stored ? { [storageKey]: clone(stored) } : {}
    })
    vi.mocked(chrome.storage.local.set).mockImplementation(async (items: Record<string, unknown>) => {
      await Promise.resolve()
      stored = clone(items.wander_llm_providers as LLMKeyRecord)
    })

    const { llmProviderStore } = await import('./llmProviders')
    const claudeConfig: ProviderConfig = {
      name: 'Anthropic (Claude)',
      apiKey: 'claude-key',
      modelNames: ['claude-opus-4-7'],
      enabled: true,
    }
    const openaiConfig: ProviderConfig = {
      name: 'OpenAI',
      apiKey: 'openai-key',
      modelNames: ['gpt-5'],
      enabled: true,
    }

    await Promise.all([
      llmProviderStore.setProvider('claude', claudeConfig),
      llmProviderStore.setProvider('openai', openaiConfig),
    ])

    const providers = await llmProviderStore.getAllProviders()
    expect(providers.claude.apiKey).toBe('claude-key')
    expect(providers.openai.apiKey).toBe('openai-key')
  })
})
