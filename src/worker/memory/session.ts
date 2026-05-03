import type { LLMMessage } from '@shared/types'
import type { LLMClient } from '../llm/client'

export interface SessionMemoryData {
  topic: string
  intent: string
  updatedAt: number
}

export class SessionMemoryManager {
  private data: SessionMemoryData | null = null

  async infer(history: LLMMessage[], client: LLMClient): Promise<void> {
    const recent = history.filter(m => m.role === 'user' || m.role === 'assistant').slice(-10)
    if (recent.length < 2) return
    const conversation = recent.map(m => `${m.role}: ${m.content}`).join('\n')
    try {
      const response = await client.chat([
        {
          role: 'user',
          content: `Based on this conversation, respond with JSON only, no explanation:\n{"topic": "一句话描述当前话题（中文）", "intent": "一句话描述用户意图（中文）"}\n\nConversation:\n${conversation}`,
        },
      ])
      const text = response.content.trim()
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return
      const parsed = JSON.parse(match[0]) as { topic?: string; intent?: string }
      if (parsed.topic && parsed.intent) {
        this.data = { topic: parsed.topic, intent: parsed.intent, updatedAt: Date.now() }
      }
    } catch {
      // silent fail - memory inference should never break the main flow
    }
  }

  get(): SessionMemoryData | null {
    return this.data
  }

  getContextString(): string {
    if (!this.data) return ''
    return `**Current Session:**\n话题：${this.data.topic}\n意图：${this.data.intent}`
  }

  clear(): void {
    this.data = null
  }
}
