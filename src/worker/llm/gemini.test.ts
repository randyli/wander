import { describe, it, expect, vi } from 'vitest'
import { GeminiClient } from './gemini'

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => 'Hello from Gemini',
          functionCalls: () => [],
        },
      }),
    }),
  })),
}))

describe('GeminiClient', () => {
  it('returns text response', async () => {
    const client = new GeminiClient({ apiKey: 'test', model: 'gemini-1.5-pro' })
    const response = await client.chat([{ role: 'user', content: 'Hi' }])
    expect(response.content).toBe('Hello from Gemini')
    expect(response.toolCalls).toEqual([])
    expect(response.stopReason).toBe('end_turn')
  })
})
