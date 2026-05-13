import { describe, it, expect, vi } from 'vitest'
import { Orchestrator } from './orchestrator'
import type { AgentDef, GeneralSettingsConfig } from '@shared/types'

const mockAgent: AgentDef = {
  name: 'researcher',
  description: 'Researches pages',
  skills: ['dom.getText'],
  llm: 'claude-opus-4-7',
  systemPrompt: 'You research pages.',
}

const mockConfig: GeneralSettingsConfig = {
  defaultProvider: 'claude',
  defaultModel: 'claude-opus-4-7',
  maxToolCallsPerTask: 20,
  maxEpisodes: 100,
  enableHistoryMemory: true,
  enableBookmarkMemory: true,
  memoryRetentionDays: 30,
}

vi.mock('./agent-runtime', () => ({
  AgentRuntime: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue({ content: 'Research complete', thinking: '' }),
  })),
}))

vi.mock('./llm/client', () => ({
  getLLMClient: vi.fn().mockReturnValue({ chat: vi.fn() }),
}))

describe('Orchestrator', () => {
  it('dispatches to first available agent and returns result', async () => {
    const orchestrator = new Orchestrator({
      getApiKey: vi.fn().mockResolvedValue('test-key'),
      getConfig: vi.fn().mockResolvedValue(mockConfig),
      executeToolCall: vi.fn(),
      listAgents: vi.fn().mockResolvedValue([mockAgent]),
      listSkills: vi.fn().mockResolvedValue([]),
      loadHistory: vi.fn().mockResolvedValue([]),
      saveHistory: vi.fn(),
      sessionMemory: { infer: vi.fn().mockResolvedValue(undefined), get: vi.fn(), getContextString: vi.fn().mockReturnValue(''), clear: vi.fn() } as any,
      systemMemory: { get: vi.fn(), getContextString: vi.fn().mockReturnValue(''), load: vi.fn(), set: vi.fn() } as any,
      workingMemory: { init: vi.fn(), clear: vi.fn(), getContext: vi.fn(), appendMessage: vi.fn(), logToolCall: vi.fn() } as any,
      episodicMemory: { save: vi.fn(), search: vi.fn().mockResolvedValue([]), list: vi.fn(), delete: vi.fn(), evict: vi.fn().mockResolvedValue(undefined), getRecent: vi.fn() } as any,
      knowledgeStore: { searchByTag: vi.fn().mockResolvedValue([]), get: vi.fn(), set: vi.fn(), list: vi.fn(), delete: vi.fn() } as any,
    })
    const result = await orchestrator.handleUserMessage('task-1', 'Research this')
    expect(result.content).toBe('Research complete')
  })

  it('falls back to default agent when none registered', async () => {
    const orchestrator = new Orchestrator({
      getApiKey: vi.fn().mockResolvedValue('test-key'),
      getConfig: vi.fn().mockResolvedValue(mockConfig),
      executeToolCall: vi.fn(),
      listAgents: vi.fn().mockResolvedValue([]),
      listSkills: vi.fn().mockResolvedValue([]),
      loadHistory: vi.fn().mockResolvedValue([]),
      saveHistory: vi.fn(),
      sessionMemory: { infer: vi.fn().mockResolvedValue(undefined), get: vi.fn(), getContextString: vi.fn().mockReturnValue(''), clear: vi.fn() } as any,
      systemMemory: { get: vi.fn(), getContextString: vi.fn().mockReturnValue(''), load: vi.fn(), set: vi.fn() } as any,
      workingMemory: { init: vi.fn(), clear: vi.fn(), getContext: vi.fn(), appendMessage: vi.fn(), logToolCall: vi.fn() } as any,
      episodicMemory: { save: vi.fn(), search: vi.fn().mockResolvedValue([]), list: vi.fn(), delete: vi.fn(), evict: vi.fn().mockResolvedValue(undefined), getRecent: vi.fn() } as any,
      knowledgeStore: { searchByTag: vi.fn().mockResolvedValue([]), get: vi.fn(), set: vi.fn(), list: vi.fn(), delete: vi.fn() } as any,
    })
    const result = await orchestrator.handleUserMessage('task-2', 'Hello')
    expect(result.content).toBeDefined()
  })
})
