import type { WorkingMemory, LLMMessage } from '@shared/types'

export class WorkingMemoryManager {
  private store = new Map<string, WorkingMemory>()

  init(taskId: string): void {
    this.store.set(taskId, { taskId, messages: [], toolCallLog: [] })
  }

  getContext(taskId: string): WorkingMemory | undefined {
    return this.store.get(taskId)
  }

  appendMessage(taskId: string, message: LLMMessage): void {
    const ctx = this.store.get(taskId)
    if (!ctx) return
    ctx.messages.push(message)
  }

  logToolCall(taskId: string, tool: string, params: unknown, result: unknown): void {
    const ctx = this.store.get(taskId)
    if (!ctx) return
    ctx.toolCallLog.push({ tool, params, result, ts: Date.now() })
  }

  clear(taskId: string): void {
    this.store.delete(taskId)
  }
}
