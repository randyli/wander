import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MessageType } from '@shared/messages'
import { generalSettingsStore, llmProviderStore } from '../storage'
import { buildRecommendedQuickActionContextItems, handleMessage } from './index'

const llmChatMock = vi.hoisted(() => vi.fn())
const getLLMClientMock = vi.hoisted(() => vi.fn(() => ({ chat: llmChatMock })))

vi.mock('./llm/client', () => ({
  getLLMClient: getLLMClientMock,
}))

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
    vi.clearAllMocks()
    getLLMClientMock.mockReturnValue({ chat: llmChatMock })
    vi.mocked(generalSettingsStore.getSettings).mockResolvedValue({
      provider: 'claude',
      model: 'claude-opus-4-7',
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

  it('returns a recognizable structured error when the selected provider has no API key', async () => {
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

describe('worker quick action recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getLLMClientMock.mockReturnValue({ chat: llmChatMock })
    vi.mocked(generalSettingsStore.getSettings).mockResolvedValue({
      provider: 'openai',
      model: 'gpt-test',
      maxToolCallsPerTask: 20,
      maxEpisodes: 100,
      enableHistoryMemory: true,
      enableBookmarkMemory: true,
      memoryRetentionDays: 30,
      quickActions: [
        { id: 'existing', label: 'Existing', prompt: 'Already configured', enabled: true, source: 'user' },
      ],
    })
    vi.mocked(llmProviderStore.getProvider).mockResolvedValue({
      name: 'OpenAI',
      apiKey: 'test-key',
      modelNames: ['gpt-test'],
      enabled: true,
    })
    chrome.history.search = vi.fn().mockResolvedValue([
      { title: 'LLM product roadmap', url: 'https://example.com/roadmap', visitCount: 4 },
    ])
    chrome.bookmarks.getTree = vi.fn().mockResolvedValue([
      { id: 'root', title: 'root', children: [{ id: 'bookmark-1', title: 'Agent recipes', url: 'https://example.com/agents' }] },
    ])
  })

  it('returns cached quick actions without generating recommendations automatically', async () => {
    const response = await handleMessage({
      type: MessageType.GET_QUICK_ACTIONS,
      requestId: 'quick-actions-cached',
    })

    expect(llmChatMock).not.toHaveBeenCalled()
    expect(response).toMatchObject({
      type: MessageType.RESPONSE,
      requestId: 'quick-actions-cached',
      payload: {
        actions: [
          { label: 'Existing', prompt: 'Already configured', source: 'user' },
        ],
      },
    })
  })

  it('uses the configured LLM to generate recommended buttons when refresh is requested', async () => {
    llmChatMock.mockResolvedValue({
      content: JSON.stringify({
        actions: [
          { label: 'Plan agents', prompt: 'Help me turn the agent roadmap into prioritized next steps.' },
        ],
      }),
      toolCalls: [],
      stopReason: 'end_turn',
    })

    const response = await handleMessage({
      type: MessageType.GET_QUICK_ACTION_RECOMMENDATIONS,
      requestId: 'quick-actions-1',
      payload: { refresh: true },
    })

    expect(getLLMClientMock).toHaveBeenCalledWith('openai', { apiKey: 'test-key', model: 'gpt-test' })
    expect(llmChatMock).toHaveBeenCalledTimes(1)
    const messages = llmChatMock.mock.calls[0][0]
    expect(messages[1].content).toContain('LLM product roadmap')
    expect(messages[1].content).toContain('Existing')
    expect(response).toMatchObject({
      type: MessageType.RESPONSE,
      requestId: 'quick-actions-1',
      payload: {
        actions: [
          { label: 'Existing', prompt: 'Already configured', source: 'user' },
          { label: 'Plan agents', prompt: 'Help me turn the agent roadmap into prioritized next steps.', source: 'recommended' },
        ],
      },
    })
  })

  it('reserves recommendation prompt slots for memory context when browser sources are large', async () => {
    const contextSignals = buildRecommendedQuickActionContextItems({
      historyItems: Array.from({ length: 50 }, (_, index) => ({
        id: `history-${index + 1}`,
        title: `History ${index + 1}`,
        url: `https://history-${index + 1}.example/page`,
        visitCount: index + 1,
      })),
      bookmarkTree: [{
        id: 'root',
        title: 'root',
        children: Array.from({ length: 40 }, (_, index) => ({
          id: `bookmark-${index + 1}`,
          title: `Bookmark ${index + 1}`,
          url: `https://bookmark-${index + 1}.example`,
        })),
      }],
      episodes: [{
        id: 'episode-1',
        createdAt: 1,
        summary: 'Important episode about agent launch planning.',
        domain: 'memory.example',
        tags: ['agents'],
      }],
      knowledge: [{
        key: 'Important workspace preference',
        value: 'The user wants quick actions focused on agent planning from saved memory.',
        tags: ['agents'],
        domain: 'memory.example',
        updatedAt: 1,
      }],
      profile: 'The user prefers practical agent workflow planning.',
    })

    expect(contextSignals).toHaveLength(58)
    expect(contextSignals).toContainEqual(expect.objectContaining({
      type: 'knowledge',
      title: 'Important workspace preference',
    }))
    expect(contextSignals).toContainEqual(expect.objectContaining({
      type: 'episode',
      summary: 'Important episode about agent launch planning.',
    }))
    expect(contextSignals).toContainEqual(expect.objectContaining({
      type: 'profile',
      summary: 'The user prefers practical agent workflow planning.',
    }))
    expect(contextSignals.filter((item: { type: string }) => item.type === 'history')).toHaveLength(30)
    expect(contextSignals.filter((item: { type: string }) => item.type === 'bookmark')).toHaveLength(25)
  })
})
