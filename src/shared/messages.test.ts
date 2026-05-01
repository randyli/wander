import { describe, it, expect } from 'vitest'
import { isToolCallMessage, isUserMessage, MessageType } from './messages'

describe('message type guards', () => {
  it('identifies TOOL_CALL message', () => {
    const msg = { type: MessageType.TOOL_CALL, payload: { tool: 'dom.getText', params: {} }, requestId: '1' }
    expect(isToolCallMessage(msg)).toBe(true)
  })

  it('rejects USER_MESSAGE as TOOL_CALL', () => {
    const msg = { type: MessageType.USER_MESSAGE, payload: { text: 'hello' }, requestId: '1' }
    expect(isToolCallMessage(msg)).toBe(false)
  })

  it('identifies USER_MESSAGE', () => {
    const msg = { type: MessageType.USER_MESSAGE, payload: { text: 'hello' }, requestId: '1' }
    expect(isUserMessage(msg)).toBe(true)
  })
})
