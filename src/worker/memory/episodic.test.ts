import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { EpisodicMemory } from './episodic'

describe('EpisodicMemory', () => {
  let episodic: EpisodicMemory

  beforeEach(async () => {
    episodic = new EpisodicMemory()
    await episodic.init()
  })

  it('saves and searches episodes', async () => {
    await episodic.save({ summary: 'User searched for hotels', domain: 'booking.com', tags: ['search'] })
    const results = await episodic.search('hotels')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].summary).toContain('hotels')
  })

  it('lists all episodes', async () => {
    await episodic.save({ summary: 'Task A', domain: 'a.com', tags: [] })
    await episodic.save({ summary: 'Task B', domain: 'b.com', tags: [] })
    expect((await episodic.list()).length).toBeGreaterThanOrEqual(2)
  })

  it('deletes an episode', async () => {
    await episodic.save({ summary: 'Delete me', domain: 'test.com', tags: [] })
    const id = (await episodic.list())[0].id
    await episodic.delete(id)
    expect((await episodic.list()).find(e => e.id === id)).toBeUndefined()
  })
})
