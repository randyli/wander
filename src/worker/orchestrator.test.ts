import { beforeEach, describe, it, expect, vi } from 'vitest'
import { Orchestrator } from './orchestrator'
import { AgentRuntime } from './agent-runtime'
import type { AgentDef, GeneralSettingsConfig } from '@shared/types'

const mockAgent: AgentDef = {
  name: 'researcher',
  description: 'Researches pages',
  skills: ['dom.getText'],
  llm: 'claude-opus-4-7',
  systemPrompt: 'You research pages.',
}

const browserAgent: AgentDef = {
  name: 'browser-agent',
  description: 'Browses pages',
  skills: ['dom.getText'],
  llm: 'claude-opus-4-7',
  systemPrompt: 'You browse pages.',
}

const orchestratorAgent: AgentDef = {
  name: 'orchestrator',
  description: 'Routes tasks to specialized sub-agents',
  skills: ['memory-read'],
  llm: 'claude-opus-4-7',
  systemPrompt: 'You route tasks.',
}

const searchAgent: AgentDef = {
  name: 'search-agent',
  description: 'Searches pages',
  skills: ['dom.getText'],
  llm: 'claude-opus-4-7',
  systemPrompt: 'You search pages.',
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

function createOrchestrator(agents: AgentDef[]) {
  return new Orchestrator({
    getApiKey: vi.fn().mockResolvedValue('test-key'),
    getConfig: vi.fn().mockResolvedValue(mockConfig),
    executeToolCall: vi.fn(),
    listAgents: vi.fn().mockResolvedValue(agents),
    listSkills: vi.fn().mockResolvedValue([]),
    loadHistory: vi.fn().mockResolvedValue([]),
    saveHistory: vi.fn(),
    sessionMemory: { infer: vi.fn().mockResolvedValue(undefined), get: vi.fn(), getContextString: vi.fn().mockReturnValue(''), clear: vi.fn() } as any,
    systemMemory: { get: vi.fn(), getContextString: vi.fn().mockReturnValue(''), load: vi.fn(), set: vi.fn() } as any,
    workingMemory: { init: vi.fn(), clear: vi.fn(), getContext: vi.fn(), appendMessage: vi.fn(), logToolCall: vi.fn() } as any,
    episodicMemory: { save: vi.fn(), search: vi.fn().mockResolvedValue([]), list: vi.fn(), delete: vi.fn(), evict: vi.fn().mockResolvedValue(undefined), getRecent: vi.fn() } as any,
    knowledgeStore: { searchByTag: vi.fn().mockResolvedValue([]), get: vi.fn(), set: vi.fn(), list: vi.fn(), delete: vi.fn() } as any,
  })
}

describe('Orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to the default agent when no orchestrator is registered and returns result', async () => {
    const orchestrator = createOrchestrator([mockAgent])
    const result = await orchestrator.handleUserMessage('task-1', 'Research this')

    expect(result.content).toBe('Research complete')
    expect(vi.mocked(AgentRuntime).mock.calls[0][0].agent.name).toBe('default')
  })

  it('falls back to default agent when none registered', async () => {
    const orchestrator = createOrchestrator([])
    const result = await orchestrator.handleUserMessage('task-2', 'Hello')

    expect(result.content).toBeDefined()
    expect(vi.mocked(AgentRuntime).mock.calls[0][0].agent.name).toBe('default')
  })

  it('selects orchestrator as the primary agent even when it is not first in the agent list', async () => {
    const orchestrator = createOrchestrator([browserAgent, orchestratorAgent, searchAgent])
    const result = await orchestrator.handleUserMessage('task-3', 'Research this')

    const runtimeConfig = vi.mocked(AgentRuntime).mock.calls[0][0]
    const agentCallTool = (runtimeConfig.tools ?? []).find(tool => tool.name === 'agent_call')

    expect(result.content).toBe('Research complete')
    expect(runtimeConfig.agent.name).toBe('orchestrator')
    expect(agentCallTool?.description).toContain('- browser-agent: Browses pages')
    expect(agentCallTool?.description).toContain('- search-agent: Searches pages')
    expect(agentCallTool?.description).not.toContain('- orchestrator:')
  })

  it('falls back after removing orchestrator without preventing other agents from being sub-agents', async () => {
    const orchestrator = createOrchestrator([browserAgent, searchAgent])
    const result = await orchestrator.handleUserMessage('task-4', 'Hello')

    const runtimeConfig = vi.mocked(AgentRuntime).mock.calls[0][0]
    const agentCallTool = (runtimeConfig.tools ?? []).find(tool => tool.name === 'agent_call')

    expect(result.content).toBe('Research complete')
    expect(runtimeConfig.agent.name).toBe('default')
    expect(agentCallTool?.description).toContain('- browser-agent: Browses pages')
    expect(agentCallTool?.description).toContain('- search-agent: Searches pages')
  })
})
