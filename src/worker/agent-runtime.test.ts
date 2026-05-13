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

  it('passes structured tool errors back to the LLM instead of throwing', async () => {
    const executeToolCall = vi.fn().mockResolvedValue({
      payload: {
        ok: false,
        result: null,
        errorCode: 'ELEMENT_NOT_FOUND',
        errorMessage: 'Element not found: #missing',
      },
    })
    const client = makeMockClient([
      { content: '', toolCalls: [{ id: 'c1', name: 'dom.getText', params: { selector: '#missing' } }], stopReason: 'tool_use' },
      { content: 'I will try another selector.', toolCalls: [], stopReason: 'end_turn' },
    ])
    const runtime = new AgentRuntime({ agent: mockAgent, client, executeToolCall, maxToolCalls: 10 })

    const result = await runtime.run('Read page', 'task-tool-error')

    expect(result.content).toBe('I will try another selector.')
    const secondCallMessages = vi.mocked(client.chat).mock.calls[1][0]
    expect(secondCallMessages.at(-1)?.role).toBe('tool')
    expect(secondCallMessages.at(-1)?.content).toContain('"ok":false')
    expect(secondCallMessages.at(-1)?.content).toContain('"errorCode":"ELEMENT_NOT_FOUND"')
  })

  it('classifies thrown restricted URL errors and returns them to the LLM', async () => {
    const executeToolCall = vi.fn().mockRejectedValue(new Error('Cannot execute tools on this page. Switch to a normal webpage first.'))
    const client = makeMockClient([
      { content: '', toolCalls: [{ id: 'c1', name: 'dom.getText', params: {} }], stopReason: 'tool_use' },
      { content: 'Please switch to a normal webpage.', toolCalls: [], stopReason: 'end_turn' },
    ])
    const runtime = new AgentRuntime({ agent: mockAgent, client, executeToolCall, maxToolCalls: 10 })

    await runtime.run('Read page', 'task-restricted-url')

    const secondCallMessages = vi.mocked(client.chat).mock.calls[1][0]
    expect(secondCallMessages.at(-1)?.content).toContain('"errorCode":"RESTRICTED_URL"')
  })

  it('classifies thrown tool timeout errors and returns them to the LLM', async () => {
    const executeToolCall = vi.fn().mockRejectedValue(new Error('Timeout waiting for: #slow'))
    const client = makeMockClient([
      { content: '', toolCalls: [{ id: 'c1', name: 'dom.waitFor', params: { selector: '#slow' } }], stopReason: 'tool_use' },
      { content: 'I will wait longer.', toolCalls: [], stopReason: 'end_turn' },
    ])
    const runtime = new AgentRuntime({ agent: mockAgent, client, executeToolCall, maxToolCalls: 10 })

    await runtime.run('Wait', 'task-timeout')

    const secondCallMessages = vi.mocked(client.chat).mock.calls[1][0]
    expect(secondCallMessages.at(-1)?.content).toContain('"errorCode":"TOOL_TIMEOUT"')
  })

})
