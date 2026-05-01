import type { SkillDef } from '@shared/types'
import { parseSkillMarkdown } from './markdown-parser'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('multiagent-skills', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('skills', { keyPath: 'name' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class SkillRegistry {
  private db!: IDBDatabase

  async init(): Promise<void> { this.db = await openDB() }

  async install(markdown: string): Promise<void> {
    const skill = parseSkillMarkdown(markdown)
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('skills', 'readwrite').objectStore('skills').put(skill)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async get(name: string): Promise<SkillDef | undefined> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('skills', 'readonly').objectStore('skills').get(name)
      req.onsuccess = () => resolve(req.result as SkillDef | undefined)
      req.onerror = () => reject(req.error)
    })
  }

  async list(): Promise<SkillDef[]> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('skills', 'readonly').objectStore('skills').getAll()
      req.onsuccess = () => resolve(req.result as SkillDef[])
      req.onerror = () => reject(req.error)
    })
  }

  async delete(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('skills', 'readwrite').objectStore('skills').delete(name)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
}
