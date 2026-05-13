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

  it('returns a recognizable structured error when the default provider has no API key', async () => {
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
        provider: 'claude',
        model: 'claude-opus-4-7',
        reason: 'API_KEY_MISSING',
      },
    })
  })
})
