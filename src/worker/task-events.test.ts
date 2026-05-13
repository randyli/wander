import { describe, it, expect, vi } from 'vitest'
import { Orchestrator } from './orchestrator'
import type { AgentDef, GeneralSettingsConfig, LLMResponse, SkillDef } from '@shared/types'
import type { LLMClient } from './llm/client'
import type { TaskEventPayload } from '@shared/messages'

vi.mock('./llm/client', () => ({
  getLLMClient: vi.fn(),
}))

const config: GeneralSettingsConfig = {
  defaultProvider: 'claude',
  defaultModel: 'claude-opus-4-7',
  maxToolCallsPerTask: 10,
  maxEpisodes: 100,
  enableHistoryMemory: true,
  enableBookmarkMemory: true,
  memoryRetentionDays: 30,
}

const orchestratorAgent: AgentDef = {
  name: 'orchestrator',
  description: 'Routes tasks',
  skills: [],
  llm: 'claude-opus-4-7',
  systemPrompt: 'You route tasks.',
}

const browserAgent: AgentDef = {
  name: 'browser',
  description: 'Reads pages',
  skills: ['read-page'],
  llm: 'claude-opus-4-7',
  systemPrompt: 'You read pages.',
}

const readPageSkill: SkillDef = {
  name: 'read-page',
  description: 'Read page text',
  tool: 'dom.getText',
  parameters: {},
  instructions: '',
}

function makeClient(responses: LLMResponse[]): LLMClient {
  let index = 0
  return {
    chat: vi.fn().mockImplementation(async () => responses[index++] ?? { content: 'done', toolCalls: [], stopReason: 'end_turn' }),
  }
}

function makeMemoryMocks() {
  return {
    sessionMemory: { infer: vi.fn().mockResolvedValue(undefined), get: vi.fn(), getContextString: vi.fn().mockReturnValue(''), clear: vi.fn() } as any,
    systemMemory: { get: vi.fn(), getContextString: vi.fn().mockReturnValue(''), load: vi.fn(), set: vi.fn() } as any,
    workingMemory: { init: vi.fn(), clear: vi.fn(), getContext: vi.fn(), appendMessage: vi.fn(), logToolCall: vi.fn() } as any,
    episodicMemory: { save: vi.fn(), search: vi.fn().mockResolvedValue([]), list: vi.fn(), delete: vi.fn(), evict: vi.fn().mockResolvedValue(undefined), getRecent: vi.fn() } as any,
    knowledgeStore: { searchByTag: vi.fn().mockResolvedValue([]), get: vi.fn(), set: vi.fn(), list: vi.fn(), delete: vi.fn() } as any,
  }
}

describe('task event stream', () => {
  it('emits events in order: user message → agent_call → tool call → tool result → final reply', async () => {
    const { getLLMClient } = await import('./llm/client')
    vi.mocked(getLLMClient)
      .mockReturnValueOnce(makeClient([
        { content: '', toolCalls: [{ id: 'main-call-1', name: 'agent_call', params: { agent_name: 'browser', task: 'Read this page' } }], stopReason: 'tool_use' },
        { content: 'Final answer', toolCalls: [], stopReason: 'end_turn' },
      ]))
      .mockReturnValueOnce(makeClient([
        { content: '', toolCalls: [{ id: 'sub-call-1', name: 'dom_getText', params: {} }], stopReason: 'tool_use' },
        { content: 'Page summary', toolCalls: [], stopReason: 'end_turn' },
      ]))

    const events: TaskEventPayload[] = []
    const orchestrator = new Orchestrator({
      getApiKey: vi.fn().mockResolvedValue('test-key'),
      getConfig: vi.fn().mockResolvedValue(config),
      executeToolCall: vi.fn().mockResolvedValue('Long page text'),
      listAgents: vi.fn().mockResolvedValue([orchestratorAgent, browserAgent]),
      listSkills: vi.fn().mockImplementation(async (names: string[]) => names.includes('read-page') ? [readPageSkill] : []),
      loadHistory: vi.fn().mockResolvedValue([]),
      saveHistory: vi.fn().mockResolvedValue(undefined),
      emitTaskEvent: event => events.push(event),
      ...makeMemoryMocks(),
    })

    const result = await orchestrator.handleUserMessage('task-1', 'Please inspect the page')

    expect(result.content).toBe('Final answer')
    expect(events.map(event => event.eventType)).toEqual([
      'user_message',
      'llm_response',
      'tool_start',
      'subagent_start',
      'llm_response',
      'tool_start',
      'tool_complete',
      'llm_response',
      'final_response',
      'subagent_complete',
      'tool_complete',
      'llm_response',
      'final_response',
    ])
    expect(events[2]).toMatchObject({ eventType: 'tool_start', toolName: 'agent_call' })
    expect(events[5]).toMatchObject({ eventType: 'tool_start', toolName: 'dom_getText' })
    expect(events[6]).toMatchObject({ eventType: 'tool_complete', toolName: 'dom_getText', summary: 'Long page text' })
    expect(events.at(-1)).toMatchObject({ eventType: 'final_response', summary: 'Final answer' })
  })
})
