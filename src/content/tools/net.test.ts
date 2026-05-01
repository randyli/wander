import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { netFetch } from './net'

describe('netFetch', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('calls fetch and returns structured result', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200, text: async () => '{"data":1}',
    } as Response)
    const result = await netFetch({ url: 'https://example.com/api' })
    expect(fetch).toHaveBeenCalledWith('https://example.com/api', {})
    expect(result).toEqual({ ok: true, status: 200, body: '{"data":1}' })
  })

  it('returns error info on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false, status: 404, text: async () => 'Not Found',
    } as Response)
    const result = await netFetch({ url: 'https://example.com/missing' })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
  })
})
