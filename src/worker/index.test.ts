import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MessageType } from '@shared/messages'
import { generalSettingsStore, llmProviderStore } from '../storage'
import { handleMessage } from './index'

vi.mock('../storage', () => ({
  llmProviderStore: {
    getAllProviders: vi.fn(),
    getProvider: vi.fn(),
    setProvider: vi.fn(),
    removeProvider: vi.fn(),
  },
  generalSettingsStore: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    resetToDefaults: vi.fn(),
  },
}))

describe('worker USER_MESSAGE provider validation', () => {
  beforeEach(() => {
    vi.mocked(generalSettingsStore.getSettings).mockResolvedValue({
      defaultProvider: 'claude',
      defaultModel: 'claude-opus-4-7',
      maxToolCallsPerTask: 20,
      maxEpisodes: 100,
      enableHistoryMemory: true,
      enableBookmarkMemory: true,
      memoryRetentionDays: 30,
    })
    vi.mocked(llmProviderStore.getAllProviders).mockResolvedValue({
      claude: {
        name: 'Anthropic (Claude)',
        apiKey: '',
        modelNames: ['claude-opus-4-7'],
        enabled: true,
      },
    })
  })

  it('returns API_KEY_MISSING when sending with a selected provider and model but no API key', async () => {
    vi.mocked(generalSettingsStore.getSettings).mockResolvedValue({
      defaultProvider: 'openai',
      defaultModel: 'gpt-5-mini',
      maxToolCallsPerTask: 20,
      maxEpisodes: 100,
      enableHistoryMemory: true,
      enableBookmarkMemory: true,
      memoryRetentionDays: 30,
    })
    vi.mocked(llmProviderStore.getAllProviders).mockResolvedValue({
      openai: {
        name: 'OpenAI',
        apiKey: '',
        modelNames: ['gpt-5', 'gpt-5-mini'],
        enabled: true,
      },
    })

    const response = await handleMessage({
      type: MessageType.USER_MESSAGE,
      requestId: 'request-1',
      payload: { text: 'hello', conversationId: 'default', taskId: 'task-1' },
    })

    expect(response).toMatchObject({
      type: MessageType.RESPONSE,
      requestId: 'request-1',
      error: {
        code: 'MISSING_PROVIDER_CONFIG',
        provider: 'openai',
        model: 'gpt-5-mini',
        reason: 'API_KEY_MISSING',
      },
    })
  })
})
