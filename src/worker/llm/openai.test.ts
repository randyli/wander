import { describe, it, expect, vi } from 'vitest'
import { OpenAIClient } from './openai'

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: { role: 'assistant', content: 'Hello from OpenAI', tool_calls: null },
            finish_reason: 'stop',
          }],
        }),
      },
    },
  })),
}))

describe('OpenAIClient', () => {
  it('returns text response', async () => {
    const client = new OpenAIClient({ apiKey: 'test', model: 'gpt-4o' })
    const response = await client.chat([{ role: 'user', content: 'Hi' }])
    expect(response.content).toBe('Hello from OpenAI')
    expect(response.toolCalls).toEqual([])
    expect(response.stopReason).toBe('end_turn')
  })
})
