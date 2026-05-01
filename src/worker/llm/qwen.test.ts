import { describe, it, expect, vi } from 'vitest'
import { QwenClient } from './qwen'
import OpenAI from 'openai'

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: { role: 'assistant', content: 'Hello from Qwen', tool_calls: null },
            finish_reason: 'stop',
          }],
        }),
      },
    },
  })),
}))

describe('QwenClient', () => {
  it('returns text response', async () => {
    const client = new QwenClient({ apiKey: 'test', model: 'qwen-plus' })
    const response = await client.chat([{ role: 'user', content: 'Hi' }])
    expect(response.content).toBe('Hello from Qwen')
    expect(response.toolCalls).toEqual([])
    expect(response.stopReason).toBe('end_turn')
  })

  it('uses Qwen base URL', () => {
    new QwenClient({ apiKey: 'test-key', model: 'qwen-plus' })
    expect(vi.mocked(OpenAI)).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' })
    )
  })
})
