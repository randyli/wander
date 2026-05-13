import type { KnowledgeEntry } from '@shared/types'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('multiagent-knowledge', 2)
    req.onupgradeneeded = () => {
      const store = req.result.objectStoreNames.contains('knowledge')
        ? req.transaction!.objectStore('knowledge')
        : req.result.createObjectStore('knowledge', { keyPath: 'key' })
      if (!store.indexNames.contains('tags')) store.createIndex('tags', 'tags', { multiEntry: true })
      if (!store.indexNames.contains('domain')) store.createIndex('domain', 'domain')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class KnowledgeStore {
  private db!: IDBDatabase

  async init(): Promise<void> { this.db = await openDB() }

  async set(key: string, value: string, tags: string[], domain?: string): Promise<void> {
    const entry: KnowledgeEntry = { key, value, tags, domain, updatedAt: Date.now() }
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

  async deleteByTag(tag: string): Promise<number> {
    const entries = await this.list()
    const keys = entries.filter(e => e.tags.includes(tag)).map(e => e.key)
    await Promise.all(keys.map(key => this.delete(key)))
    return keys.length
  }

  async deleteByDomain(domain: string): Promise<number> {
    const entries = await this.list()
    const keys = entries.filter(e => e.domain === domain).map(e => e.key)
    await Promise.all(keys.map(key => this.delete(key)))
    return keys.length
  }

  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('knowledge', 'readwrite').objectStore('knowledge').clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async exportJson(): Promise<string> {
    return JSON.stringify(await this.list(), null, 2)
  }
}
