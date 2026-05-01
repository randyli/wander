import { describe, it, expect, vi } from 'vitest'
import { Orchestrator } from './orchestrator'
import type { AgentDef, GlobalConfig } from '@shared/types'

const mockAgent: AgentDef = {
  name: 'researcher',
  description: 'Researches pages',
  skills: ['dom.getText'],
  llm: 'claude-opus-4-7',
  systemPrompt: 'You research pages.',
}

const mockConfig: GlobalConfig = {
  defaultProvider: 'claude',
  defaultModel: 'claude-opus-4-7',
  maxToolCallsPerTask: 20,
  maxEpisodes: 100,
}

vi.mock('./agent-runtime', () => ({
  AgentRuntime: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue('Research complete'),
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
    })
    const result = await orchestrator.handleUserMessage('task-1', 'Research this')
    expect(result).toBe('Research complete')
  })

  it('falls back to default agent when none registered', async () => {
    const orchestrator = new Orchestrator({
      getApiKey: vi.fn().mockResolvedValue('test-key'),
      getConfig: vi.fn().mockResolvedValue(mockConfig),
      executeToolCall: vi.fn(),
      listAgents: vi.fn().mockResolvedValue([]),
    })
    const result = await orchestrator.handleUserMessage('task-2', 'Hello')
    expect(typeof result).toBe('string')
  })
})
