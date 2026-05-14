import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import ProvidersTab from './ProvidersTab'

const providers = {
  claude: {
    name: 'Anthropic (Claude)',
    apiKey: '',
    modelNames: ['claude-opus-4-7'],
    enabled: true,
  },
  openai: {
    name: 'OpenAI',
    apiKey: '',
    modelNames: ['gpt-5', 'gpt-5-mini'],
    enabled: true,
  },
}

const generalSettings = {
  defaultProvider: 'claude',
  defaultModel: 'claude-opus-4-7',
  maxToolCallsPerTask: 20,
  maxEpisodes: 100,
  enableHistoryMemory: true,
  enableBookmarkMemory: true,
  memoryRetentionDays: 30,
}

describe('ProvidersTab quick setup', () => {
  let originalActEnvironment: boolean | undefined
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    originalActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    const sendMessageMock = vi.mocked(chrome.runtime.sendMessage as any)
    sendMessageMock.mockReset()
    sendMessageMock.mockImplementation((message: any) => {
      if (message.type === 'GET_PROVIDERS') return Promise.resolve({ payload: providers })
      if (message.type === 'GET_GENERAL_SETTINGS') return Promise.resolve({ payload: generalSettings })
      return Promise.resolve({ payload: { ok: true } })
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
  })

  it('allows provider and model selection before an API key is entered', async () => {
    await act(async () => {
      root.render(<ProvidersTab isDarkMode={false} />)
      await Promise.resolve()
    })

    expect(container.textContent).toContain('一步式模型配置')
    expect(container.textContent).toContain('发送任务前必填')

    let selects = container.querySelectorAll('select')
    expect(selects).toHaveLength(2)

    await act(async () => {
      Simulate.change(selects[0], { target: { value: 'openai' } } as any)
      await Promise.resolve()
    })

    selects = container.querySelectorAll('select')
    expect(Array.from(selects[1].querySelectorAll('option')).map(option => option.value)).toContain('gpt-5-mini')

    await act(async () => {
      Simulate.change(selects[1], { target: { value: 'gpt-5-mini' } } as any)
      await Promise.resolve()
    })

    const updateCalls = vi.mocked(chrome.runtime.sendMessage as any).mock.calls
      .map(([message]: any[]) => message)
      .filter((message: { type: string }) => message.type === 'UPDATE_GENERAL_SETTINGS')

    expect(updateCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ payload: { defaultProvider: 'openai' } }),
      expect.objectContaining({ payload: { defaultModel: 'gpt-5-mini' } }),
    ]))
    expect(vi.mocked(chrome.runtime.sendMessage as any).mock.calls.some(([message]: any[]) => message.type === 'SET_PROVIDER')).toBe(false)
  })
})
