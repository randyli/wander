import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemMemoryManager } from './system'
import type { LLMClient } from '../llm/client'

describe('SystemMemoryManager', () => {
  let manager: SystemMemoryManager
  let client: LLMClient

  beforeEach(async () => {
    vi.clearAllMocks()
    chrome.storage.local.get = vi.fn().mockResolvedValue({})
    chrome.storage.local.set = vi.fn().mockResolvedValue(undefined)
    chrome.history.search = vi.fn().mockResolvedValue([{ url: 'https://example.com/a', visitCount: 3 }])
    chrome.bookmarks.getTree = vi.fn().mockResolvedValue([{ id: '1', title: 'root', children: [{ id: '2', title: 'Example', url: 'https://example.com' }] }])
    client = { chat: vi.fn().mockResolvedValue({ content: '用户关注示例站点。', toolCalls: [], stopReason: 'end_turn' }) } as unknown as LLMClient
    manager = new SystemMemoryManager()
    await manager.load()
  })

  it('does not call chrome.history.search when history memory is disabled', async () => {
    await manager.buildIfStale(client, {
      enableHistoryMemory: false,
      enableBookmarkMemory: true,
      memoryRetentionDays: 30,
    })

    expect(chrome.history.search).not.toHaveBeenCalled()
    expect(chrome.bookmarks.getTree).toHaveBeenCalledTimes(1)
  })

  it('does not call chrome.bookmarks.getTree when bookmark memory is disabled', async () => {
    await manager.buildIfStale(client, {
      enableHistoryMemory: true,
      enableBookmarkMemory: false,
      memoryRetentionDays: 30,
    })

    expect(chrome.history.search).toHaveBeenCalledTimes(1)
    expect(chrome.bookmarks.getTree).not.toHaveBeenCalled()
  })

  it('does not call history or bookmarks when both system memory sources are disabled', async () => {
    await manager.buildIfStale(client, {
      enableHistoryMemory: false,
      enableBookmarkMemory: false,
      memoryRetentionDays: 30,
    })

    expect(chrome.history.search).not.toHaveBeenCalled()
    expect(chrome.bookmarks.getTree).not.toHaveBeenCalled()
    expect(client.chat).not.toHaveBeenCalled()
  })
})
