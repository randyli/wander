import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { KnowledgeStore } from './knowledge'

describe('KnowledgeStore', () => {
  let store: KnowledgeStore

  beforeEach(async () => {
    store = new KnowledgeStore()
    await store.init()
  })

  it('sets and gets a value', async () => {
    await store.set('user.name', 'Alice', ['profile'])
    expect((await store.get('user.name'))?.value).toBe('Alice')
  })

  it('returns undefined for missing key', async () => {
    expect(await store.get('nonexistent')).toBeUndefined()
  })

  it('searches by tag', async () => {
    await store.set('pref.theme', 'dark', ['prefs'])
    await store.set('pref.lang', 'zh', ['prefs'])
    expect((await store.searchByTag('prefs')).length).toBeGreaterThanOrEqual(2)
  })

  it('deletes a key', async () => {
    await store.set('temp', 'value', [])
    await store.delete('temp')
    expect(await store.get('temp')).toBeUndefined()
  })
})
