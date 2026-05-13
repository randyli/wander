import { createStorage } from './base'
import type { BaseStorage } from './base'

export interface ProviderConfig {
  name?: string
  apiKey: string
  baseUrl?: string
  modelNames: string[]
  enabled: boolean
}

export interface LLMKeyRecord {
  providers: Record<string, ProviderConfig>
}

export type LLMProviderStorage = BaseStorage<LLMKeyRecord> & {
  setProvider: (providerId: string, config: ProviderConfig) => Promise<void>
  getProvider: (providerId: string) => Promise<ProviderConfig | undefined>
  removeProvider: (providerId: string) => Promise<void>
  getAllProviders: () => Promise<Record<string, ProviderConfig>>
}

const DEFAULT_PROVIDERS: Record<string, ProviderConfig> = {
  claude: {
    name: 'Anthropic (Claude)',
    apiKey: '',
    modelNames: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    enabled: true,
  },
  openai: {
    name: 'OpenAI',
    apiKey: '',
    modelNames: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o'],
    enabled: true,
  },
  gemini: {
    name: 'Google (Gemini)',
    apiKey: '',
    modelNames: ['gemini-3-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    enabled: true,
  },
  deepseek: {
    name: 'DeepSeek',
    apiKey: '',
    modelNames: ['deepseek-chat', 'deepseek-reasoner'],
    enabled: true,
  },
  qwen: {
    name: 'Qwen',
    apiKey: '',
    modelNames: ['qwen3.6-plus', 'qwen-max', 'qwen-plus'],
    enabled: true,
  },
}

const storage = createStorage<LLMKeyRecord>(
  'wander_llm_providers',
  { providers: DEFAULT_PROVIDERS },
  { liveUpdate: true },
)

export const llmProviderStore: LLMProviderStorage = {
  ...storage,
  async setProvider(providerId: string, config: ProviderConfig) {
    const current = await storage.get()
    await storage.set({
      providers: {
        ...current.providers,
        [providerId]: config,
      },
    })
  },
  async getProvider(providerId: string) {
    const data = await storage.get()
    return data.providers[providerId]
  },
  async removeProvider(providerId: string) {
    const current = await storage.get()
    const newProviders = { ...current.providers }
    delete newProviders[providerId]
    await storage.set({ providers: newProviders })
  },
  async getAllProviders() {
    const data = await storage.get()
    // Merge with defaults so known providers always exist with their default models
    return { ...DEFAULT_PROVIDERS, ...data.providers }
  },
}
