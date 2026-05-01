import { describe, it, expect, vi } from 'vitest'
import { DeepSeekClient } from './deepseek'
import OpenAI from 'openai'

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: { role: 'assistant', content: 'Hello from DeepSeek', tool_calls: null },
            finish_reason: 'stop',
          }],
        }),
      },
    },
  })),
}))

describe('DeepSeekClient', () => {
  it('returns text response', async () => {
    const client = new DeepSeekClient({ apiKey: 'test', model: 'deepseek-chat' })
    const response = await client.chat([{ role: 'user', content: 'Hi' }])
    expect(response.content).toBe('Hello from DeepSeek')
    expect(response.toolCalls).toEqual([])
    expect(response.stopReason).toBe('end_turn')
  })

  it('uses DeepSeek base URL', () => {
    new DeepSeekClient({ apiKey: 'test-key', model: 'deepseek-chat' })
    expect(vi.mocked(OpenAI)).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.deepseek.com' })
    )
  })
})
