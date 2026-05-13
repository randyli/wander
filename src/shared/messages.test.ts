import { describe, it, expect } from 'vitest'
import { isTaskEventMessage, isToolCallMessage, isUserMessage, MessageType } from './messages'

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

  it('identifies TASK_EVENT message', () => {
    const msg = {
      type: MessageType.TASK_EVENT,
      requestId: '1',
      payload: { taskId: 'task-1', agentName: 'assistant', eventType: 'tool_start', toolName: 'dom_getText', params: {}, status: 'running' },
    }
    expect(isTaskEventMessage(msg)).toBe(true)
  })
})
