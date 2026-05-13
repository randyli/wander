import type { LLMClient } from '../llm/client'

export interface SystemMemoryData {
  profile: string
  builtAt: number
  sources: {
    history: boolean
    bookmarks: boolean
  }
}

export interface SystemMemoryBuildOptions {
  enableHistoryMemory: boolean
  enableBookmarkMemory: boolean
  memoryRetentionDays: number
}

const STORAGE_KEY = 'systemMemory'
const STALE_MS = 24 * 60 * 60 * 1000
const DEFAULT_BUILD_OPTIONS: SystemMemoryBuildOptions = {
  enableHistoryMemory: true,
  enableBookmarkMemory: true,
  memoryRetentionDays: 30,
}

export class SystemMemoryManager {
  private data: SystemMemoryData | null = null

  async load(): Promise<void> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const data = result[STORAGE_KEY] as (SystemMemoryData & { sources?: SystemMemoryData['sources'] }) | undefined
    this.data = data ? { ...data, sources: data.sources ?? { history: true, bookmarks: true } } : null
  }

  isStale(): boolean {
    if (!this.data) return true
    return Date.now() - this.data.builtAt > STALE_MS
  }

  async buildIfStale(client: LLMClient, options: Partial<SystemMemoryBuildOptions> = {}): Promise<void> {
    const buildOptions = { ...DEFAULT_BUILD_OPTIONS, ...options }
    if (!this.isStale()) return
    if (!buildOptions.enableHistoryMemory && !buildOptions.enableBookmarkMemory) return

    try {
      const [historyItems, bookmarkTree] = await Promise.all([
        buildOptions.enableHistoryMemory
          ? chrome.history.search({
            text: '',
            maxResults: 200,
            startTime: Date.now() - buildOptions.memoryRetentionDays * 24 * 60 * 60 * 1000,
          })
          : Promise.resolve([] as chrome.history.HistoryItem[]),
        buildOptions.enableBookmarkMemory
          ? chrome.bookmarks.getTree()
          : Promise.resolve([] as chrome.bookmarks.BookmarkTreeNode[]),
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

      const prompt = `Based on the enabled browser memory sources, write a 2-3 sentence user profile in Chinese describing their interests, work type, and common online activities.

History memory enabled: ${buildOptions.enableHistoryMemory}
Bookmark memory enabled: ${buildOptions.enableBookmarkMemory}
Retention window (days): ${buildOptions.memoryRetentionDays}
Top visited domains: ${topDomains.join(', ') || '(disabled or empty)'}
Bookmarks (sample): ${bookmarkTitles.slice(0, 50).join(' / ') || '(disabled or empty)'}

Respond with a plain profile text only, no JSON, no headers.`

      const response = await client.chat([{ role: 'user', content: prompt }])
      const profile = response.content.trim()
      if (profile) {
        this.data = {
          profile,
          builtAt: Date.now(),
          sources: {
            history: buildOptions.enableHistoryMemory,
            bookmarks: buildOptions.enableBookmarkMemory,
          },
        }
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
    const sources = [
      this.data.sources.history ? 'history' : null,
      this.data.sources.bookmarks ? 'bookmarks' : null,
    ].filter(Boolean).join(', ')
    return `**Source: system**\nUser profile (${sources || 'none'}):\n${this.data.profile}`
  }
}
