import type { AgentDef } from '@shared/types'
import { parseAgentMarkdown } from './markdown-parser'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('multiagent-agents', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('agents', { keyPath: 'name' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class AgentRegistry {
  private db!: IDBDatabase

  async init(): Promise<void> { this.db = await openDB() }

  async install(markdown: string): Promise<void> {
    const agent = parseAgentMarkdown(markdown)
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('agents', 'readwrite').objectStore('agents').put(agent)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async get(name: string): Promise<AgentDef | undefined> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('agents', 'readonly').objectStore('agents').get(name)
      req.onsuccess = () => resolve(req.result as AgentDef | undefined)
      req.onerror = () => reject(req.error)
    })
  }

  async list(): Promise<AgentDef[]> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('agents', 'readonly').objectStore('agents').getAll()
      req.onsuccess = () => resolve(req.result as AgentDef[])
      req.onerror = () => reject(req.error)
    })
  }

  async delete(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('agents', 'readwrite').objectStore('agents').delete(name)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
}
