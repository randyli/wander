import type { KnowledgeEntry } from '@shared/types'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('multiagent-knowledge', 1)
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('knowledge', { keyPath: 'key' })
      store.createIndex('tags', 'tags', { multiEntry: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class KnowledgeStore {
  private db!: IDBDatabase

  async init(): Promise<void> { this.db = await openDB() }

  async set(key: string, value: string, tags: string[]): Promise<void> {
    const entry: KnowledgeEntry = { key, value, tags, updatedAt: Date.now() }
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('knowledge', 'readwrite').objectStore('knowledge').put(entry)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async get(key: string): Promise<KnowledgeEntry | undefined> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('knowledge', 'readonly').objectStore('knowledge').get(key)
      req.onsuccess = () => resolve(req.result as KnowledgeEntry | undefined)
      req.onerror = () => reject(req.error)
    })
  }

  async searchByTag(tag: string): Promise<KnowledgeEntry[]> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('knowledge', 'readonly').objectStore('knowledge').index('tags').getAll(tag)
      req.onsuccess = () => resolve(req.result as KnowledgeEntry[])
      req.onerror = () => reject(req.error)
    })
  }

  async list(): Promise<KnowledgeEntry[]> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('knowledge', 'readonly').objectStore('knowledge').getAll()
      req.onsuccess = () => resolve(req.result as KnowledgeEntry[])
      req.onerror = () => reject(req.error)
    })
  }

  async delete(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('knowledge', 'readwrite').objectStore('knowledge').delete(key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
}
