import { describe, it, expect, beforeEach } from 'vitest'
import { WorkingMemoryManager } from './working'

describe('WorkingMemoryManager', () => {
  let manager: WorkingMemoryManager

  beforeEach(() => { manager = new WorkingMemoryManager() })

  it('creates working memory for a task', () => {
    manager.init('task-1')
    expect(manager.getContext('task-1')?.messages).toEqual([])
  })

  it('appends messages', () => {
    manager.init('task-1')
    manager.appendMessage('task-1', { role: 'user', content: 'Hello' })
    manager.appendMessage('task-1', { role: 'assistant', content: 'Hi' })
    expect(manager.getContext('task-1')!.messages).toHaveLength(2)
  })

  it('logs tool calls', () => {
    manager.init('task-1')
    manager.logToolCall('task-1', 'dom.getText', { selector: '#main' }, 'page text')
    expect(manager.getContext('task-1')!.toolCallLog).toHaveLength(1)
    expect(manager.getContext('task-1')!.toolCallLog[0].tool).toBe('dom.getText')
  })

  it('clears task memory', () => {
    manager.init('task-1')
    manager.appendMessage('task-1', { role: 'user', content: 'Test' })
    manager.clear('task-1')
    expect(manager.getContext('task-1')).toBeUndefined()
  })
})
