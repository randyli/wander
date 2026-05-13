import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageType } from '@shared/messages'
import { createToolApprovalError, getToolRisk, requestToolApproval, requiresToolApproval } from './tool-approval'

type SendMessageMock = {
  mockReset: () => void
  mockImplementation: (fn: (...args: unknown[]) => unknown) => void
}

function sendMessageMock(): SendMessageMock {
  return chrome.runtime.sendMessage as unknown as SendMessageMock
}

describe('tool approval flow', () => {
  afterEach(() => {
    vi.useRealTimers()
    sendMessageMock().mockReset()
    chrome.runtime.lastError = undefined
  })

  it('allows an approved high-risk tool call', async () => {
    sendMessageMock().mockImplementation((...args: unknown[]) => {
      const [message, callback] = args as [unknown, ((response: unknown) => void) | undefined]
      expect((message as { type: MessageType }).type).toBe(MessageType.TOOL_APPROVAL_REQUEST)
      callback?.({ type: MessageType.TOOL_APPROVAL_RESPONSE, payload: { approved: true } })
    })

    await expect(requestToolApproval({
      tool: 'nav.goto',
      params: { url: 'https://example.com' },
      targetUrl: 'https://example.com',
      risk: 'navigate',
    })).resolves.toEqual({ approved: true, reason: undefined })
  })

  it('returns a structured error when the user rejects a high-risk tool call', async () => {
    sendMessageMock().mockImplementation((...args: unknown[]) => {
      const [, callback] = args as [unknown, ((response: unknown) => void) | undefined]
      callback?.({ type: MessageType.TOOL_APPROVAL_RESPONSE, payload: { approved: false, reason: 'Rejected by user' } })
    })

    const details = {
      tool: 'history.search',
      params: { query: 'bank' },
      targetUrl: 'chrome://history',
      risk: 'sensitive' as const,
    }
    const approval = await requestToolApproval(details)
    const error = createToolApprovalError(details, 'TOOL_APPROVAL_DENIED', approval.reason ?? 'Tool execution was rejected by the user')

    expect(approval).toEqual({ approved: false, reason: 'Rejected by user' })
    expect(error).toEqual({
      ok: false,
      error: {
        code: 'TOOL_APPROVAL_DENIED',
        message: 'Rejected by user',
        tool: 'history.search',
        risk: 'sensitive',
        targetUrl: 'chrome://history',
      },
    })
  })

  it('times out when the side panel does not respond', async () => {
    vi.useFakeTimers()
    sendMessageMock().mockImplementation(() => undefined)

    const approvalPromise = requestToolApproval({
      tool: 'page.screenshot',
      params: {},
      targetUrl: 'https://example.com',
      risk: 'sensitive',
    }, 1000)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(approvalPromise).resolves.toEqual({ approved: false, reason: 'Approval timed out' })
  })

  it('identifies high-risk tools and their risk levels', () => {
    expect(requiresToolApproval('dom_fill')).toBe(true)
    expect(getToolRisk('dom_fill')).toBe('sensitive')
    expect(requiresToolApproval('dom_getText')).toBe(false)
    expect(getToolRisk('dom_getText')).toBe('read')
  })
})
