import type { LLMClient } from '../llm/client'

export interface SystemMemoryData {
  profile: string
  builtAt: number
}

const STORAGE_KEY = 'systemMemory'
const STALE_MS = 24 * 60 * 60 * 1000

export class SystemMemoryManager {
  private data: SystemMemoryData | null = null

  async load(): Promise<void> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    this.data = (result[STORAGE_KEY] as SystemMemoryData) ?? null
  }

  isStale(): boolean {
    if (!this.data) return true
    return Date.now() - this.data.builtAt > STALE_MS
  }

  async buildIfStale(client: LLMClient): Promise<void> {
    if (!this.isStale()) return
    try {
      const [historyItems, bookmarkTree] = await Promise.all([
        chrome.history.search({ text: '', maxResults: 200, startTime: Date.now() - 30 * 24 * 60 * 60 * 1000 }),
        chrome.bookmarks.getTree(),
      ])

      // Extract top domains by visit count
      const domainCount = new Map<string, number>()
      for (const item of historyItems) {
        try {
          const domain = new URL(item.url ?? '').hostname
          domainCount.set(domain, (domainCount.get(domain) ?? 0) + (item.visitCount ?? 1))
        } catch { /* ignore invalid URLs */ }
      }
      const topDomains = [...domainCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([d]) => d)

      // Extract bookmark titles (flat)
      const bookmarkTitles: string[] = []
      function extractTitles(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
        for (const node of nodes) {
          if (node.url && node.title) bookmarkTitles.push(node.title)
          if (node.children) extractTitles(node.children)
        }
      }
      extractTitles(bookmarkTree)

      const prompt = `Based on the user's browser data, write a 2-3 sentence user profile in Chinese describing their interests, work type, and common online activities.

Top visited domains: ${topDomains.join(', ')}
Bookmarks (sample): ${bookmarkTitles.slice(0, 50).join(' / ')}

Respond with a plain profile text only, no JSON, no headers.`

      const response = await client.chat([{ role: 'user', content: prompt }])
      const profile = response.content.trim()
      if (profile) {
        this.data = { profile, builtAt: Date.now() }
        await chrome.storage.local.set({ [STORAGE_KEY]: this.data })
      }
    } catch {
      // silent fail
    }
  }

  get(): SystemMemoryData | null {
    return this.data
  }

  getContextString(): string {
    if (!this.data?.profile) return ''
    return `**User Profile:**\n${this.data.profile}`
  }
}
