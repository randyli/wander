import { describe, it, expect, vi } from 'vitest'
import { AgentRuntime } from './agent-runtime'
import type { AgentDef, LLMResponse } from '@shared/types'
import type { LLMClient } from './llm/client'

const mockAgent: AgentDef = {
  name: 'test-agent',
  description: 'Test',
  skills: ['dom.getText'],
  llm: 'claude-opus-4-7',
  systemPrompt: 'You are a test agent.',
}

function makeMockClient(responses: LLMResponse[]): LLMClient {
  let i = 0
  return { chat: vi.fn().mockImplementation(async () => responses[i++] ?? { content: 'done', toolCalls: [], stopReason: 'end_turn' }) }
}

describe('AgentRuntime', () => {
  it('returns response when no tools needed', async () => {
    const runtime = new AgentRuntime({
      agent: mockAgent,
      client: makeMockClient([{ content: 'Task complete', toolCalls: [], stopReason: 'end_turn' }]),
      executeToolCall: vi.fn(),
      maxToolCalls: 10,
    })
    expect((await runtime.run('Do a task', 'task-1')).content).toBe('Task complete')
  })

  it('executes tool calls then continues', async () => {
    const executeToolCall = vi.fn().mockResolvedValue('page text')
    const runtime = new AgentRuntime({
      agent: mockAgent,
      client: makeMockClient([
        { content: '', toolCalls: [{ id: 'c1', name: 'dom.getText', params: {} }], stopReason: 'tool_use' },
        { content: 'Found: page text', toolCalls: [], stopReason: 'end_turn' },
      ]),
      executeToolCall,
      maxToolCalls: 10,
    })
    const result = await runtime.run('Read page', 'task-2')
    expect(executeToolCall).toHaveBeenCalledWith('dom.getText', {})
    expect(result.content).toBe('Found: page text')
  })

  it('throws when max tool calls exceeded', async () => {
    const loopResponse: LLMResponse = { content: '', toolCalls: [{ id: 'c1', name: 'dom.getText', params: {} }], stopReason: 'tool_use' }
    const runtime = new AgentRuntime({
      agent: mockAgent,
      client: makeMockClient(Array(15).fill(loopResponse)),
      executeToolCall: vi.fn().mockResolvedValue('text'),
      maxToolCalls: 3,
    })
    await expect(runtime.run('loop', 'task-3')).rejects.toThrow('Max tool calls')
  })

  it('does not execute later tool calls after cancellation', async () => {
    const controller = new AbortController()
    const executeToolCall = vi.fn().mockImplementation(async () => {
      controller.abort()
      return 'first result'
    })
    const runtime = new AgentRuntime({
      agent: mockAgent,
      client: makeMockClient([
        {
          content: '',
          toolCalls: [
            { id: 'c1', name: 'dom.getText', params: { step: 1 } },
            { id: 'c2', name: 'dom.click', params: { step: 2 } },
          ],
          stopReason: 'tool_use',
        },
      ]),
      executeToolCall,
      maxToolCalls: 10,
      signal: controller.signal,
    })

    await expect(runtime.run('cancel midway', 'task-cancel')).rejects.toThrow('Task cancelled')
    expect(executeToolCall).toHaveBeenCalledTimes(1)
    expect(executeToolCall).not.toHaveBeenCalledWith('dom.click', { step: 2 })
  })

})
