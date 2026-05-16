import { describe, it, expect, beforeEach, vi } from 'vitest'
import { netFetch } from './tools/net'
import { handleToolCall } from './index'

vi.mock('./tools/net', () => ({
  netFetch: vi.fn().mockResolvedValue({ mocked: true }),
}))

describe('handleToolCall', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = '<p id="para">Test content</p>'
  })

  it('routes dom.getText to domGetText with structured success', async () => {
    const result = await handleToolCall('dom.getText', { selector: '#para' })
    expect(result).toEqual({ ok: true, result: 'Test content' })
  })

  it('routes dom.click and returns structured undefined result', async () => {
    document.body.innerHTML = '<button id="btn">Click me</button>'
    let clicked = false
    document.getElementById('btn')!.addEventListener('click', () => { clicked = true })
    const result = await handleToolCall('dom.click', { selector: '#btn' })
    expect(clicked).toBe(true)
    expect(result).toEqual({ ok: true, result: undefined })
  })

  it('returns structured element-not-found errors', async () => {
    await expect(handleToolCall('dom.getText', { selector: '#missing' })).resolves.toEqual({
      ok: false,
      result: null,
      errorCode: 'ELEMENT_NOT_FOUND',
      errorMessage: 'Element not found: #missing',
    })
  })

  it('returns structured tool timeout errors', async () => {
    const result = await handleToolCall('dom.waitFor', { selector: '#missing', timeout: 10 })
    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('TOOL_TIMEOUT')
    expect(result.errorMessage).toContain('Timeout waiting for')
  })

  it('routes finance-specific fetch tools to netFetch', async () => {
    const params = { url: 'https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv' }
    const result = await handleToolCall('finance.stooq', params)

    expect(netFetch).toHaveBeenCalledWith(params)
    expect(result).toEqual({ ok: true, result: { mocked: true } })
  })

  it('returns structured generic tool errors', async () => {
    const result = await handleToolCall('unknown.tool', {})
    expect(result).toEqual({
      ok: false,
      result: null,
      errorCode: 'TOOL_ERROR',
      errorMessage: 'Unknown tool: unknown.tool',
    })
  })
})
