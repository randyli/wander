import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ClaudeClient } from './claude'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Hello from Claude' }],
        stop_reason: 'end_turn',
      }),
    },
  })),
}))

describe('ClaudeClient', () => {
  let client: ClaudeClient

  beforeEach(() => {
    client = new ClaudeClient({ apiKey: 'test-key', model: 'claude-opus-4-7' })
  })

  it('returns text response', async () => {
    const response = await client.chat([{ role: 'user', content: 'Hello' }])
    expect(response.content).toBe('Hello from Claude')
    expect(response.stopReason).toBe('end_turn')
    expect(response.toolCalls).toEqual([])
  })

  it('parses tool_use response', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'tool_use', id: 'call_1', name: 'dom.getText', input: { selector: '#main' } }],
          stop_reason: 'tool_use',
        }),
      },
    }) as never)
    const c = new ClaudeClient({ apiKey: 'key', model: 'claude-opus-4-7' })
    const response = await c.chat([{ role: 'user', content: 'Get text' }])
    expect(response.toolCalls).toHaveLength(1)
    expect(response.toolCalls[0].name).toBe('dom.getText')
    expect(response.stopReason).toBe('tool_use')
  })
})
