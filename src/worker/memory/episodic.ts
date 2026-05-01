import type { Episode } from '@shared/types'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('multiagent-episodes', 1)
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('episodes', { keyPath: 'id' })
      store.createIndex('tags', 'tags', { multiEntry: true })
      store.createIndex('domain', 'domain')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class EpisodicMemory {
  private db!: IDBDatabase

  async init(): Promise<void> { this.db = await openDB() }

  async save(entry: Omit<Episode, 'id' | 'createdAt'>): Promise<string> {
    const episode: Episode = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() }
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('episodes', 'readwrite').objectStore('episodes').add(episode)
      req.onsuccess = () => resolve(episode.id)
      req.onerror = () => reject(req.error)
    })
  }

  async list(): Promise<Episode[]> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('episodes', 'readonly').objectStore('episodes').getAll()
      req.onsuccess = () => resolve(req.result as Episode[])
      req.onerror = () => reject(req.error)
    })
  }

  async search(keyword: string): Promise<Episode[]> {
    const lower = keyword.toLowerCase()
    return (await this.list()).filter(e =>
      e.summary.toLowerCase().includes(lower) ||
      e.tags.some(t => t.toLowerCase().includes(lower)) ||
      e.domain.toLowerCase().includes(lower)
    )
  }

  async delete(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('episodes', 'readwrite').objectStore('episodes').delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
}
