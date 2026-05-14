import { describe, expect, it, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest'
import { act } from 'react'
import { Simulate } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { MessageType } from '@shared/messages'
import ChatPanel, { getApprovalParamRows, getApprovalRiskLabel, getApprovalToolLabel } from './ChatPanel'

const MESSAGE_INPUT_ARIA_LABEL = 'Message your agent'

function getMessageInput(container: HTMLElement): HTMLTextAreaElement {
  const input = container.querySelector<HTMLTextAreaElement>(`[aria-label="${MESSAGE_INPUT_ARIA_LABEL}"]`)
  expect(input).toBeTruthy()
  return input!
}

function installChatPanelSendMessageMock(apiKey = '', keepUserMessagePending = false) {
  const sendMessageMock = vi.mocked(chrome.runtime.sendMessage as any)
  sendMessageMock.mockReset()
  sendMessageMock.mockImplementation((message: any, callback?: (response: unknown) => void) => {
    if (message.type === MessageType.GET_HISTORY) callback?.({ type: MessageType.RESPONSE, requestId: message.requestId, payload: [] })
    else if (message.type === MessageType.GET_PROVIDERS) callback?.({
      type: MessageType.RESPONSE,
      requestId: message.requestId,
      payload: {
        claude: {
          name: 'Anthropic (Claude)',
          apiKey,
          modelNames: ['claude-opus-4-7'],
          enabled: true,
        },
      },
    })
    else if (message.type === MessageType.GET_GENERAL_SETTINGS) callback?.({
      type: MessageType.RESPONSE,
      requestId: message.requestId,
      payload: {
        provider: 'claude',
        model: 'claude-opus-4-7',
        maxToolCallsPerTask: 20,
        maxEpisodes: 100,
        enableHistoryMemory: true,
        enableBookmarkMemory: true,
        memoryRetentionDays: 30,
      },
    })
    else if (message.type === MessageType.USER_MESSAGE && !keepUserMessagePending) callback?.({ type: MessageType.AGENT_MESSAGE, requestId: message.requestId, payload: { text: 'should not run' } })
    return undefined as any
  })
}

describe('approval display helpers', () => {
  it('renders high-risk tool details as user-friendly labels instead of JSON', () => {
    expect(getApprovalToolLabel('dom.fill')).toBe('填写网页表单')
    expect(getApprovalRiskLabel('sensitive')).toContain('敏感风险')
    expect(getApprovalParamRows('dom.fill', {
      selector: '#email',
      value: 'user@example.com',
      submit: 'false',
    })).toEqual([
      { label: '页面位置', value: '#email' },
      { label: '填写内容', value: 'user@example.com' },
      { label: '填写后提交', value: '否' },
    ])
  })

  it('summarizes tools with no obvious params in plain language', () => {
    expect(getApprovalParamRows('page.screenshot', {})).toEqual([
      { label: '截图范围', value: '当前可见页面' },
    ])
    expect(getApprovalParamRows('dom.submit', {})).toEqual([
      { label: '提交表单', value: '页面中的第一个表单' },
    ])
  })
})

describe('ChatPanel provider preflight', () => {
  let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView
  let originalActEnvironment: boolean | undefined
  let container: HTMLDivElement
  let root: Root

  beforeAll(() => {
    originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    originalActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterAll(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
  })

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    installChatPanelSendMessageMock()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders quick action buttons and fills the input with focus when clicked', async () => {
    await act(async () => {
      root.render(<ChatPanel />)
    })

    expect(container.querySelector('[aria-label="快捷动作：看新闻"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="快捷动作：找工作"]')).toBeTruthy()
    const summarizeButton = container.querySelector<HTMLButtonElement>('[aria-label="快捷动作：总结当前页"]')
    expect(summarizeButton).toBeTruthy()

    const input = getMessageInput(container)
    await act(async () => {
      Simulate.click(summarizeButton!)
    })

    expect(input.value).toBe('请阅读并总结当前页面，提炼核心观点、关键数据和可执行事项。')
    expect(document.activeElement).toBe(input)
  })

  it('uses the current local date in the news quick action prompt', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-14T12:00:00Z'))

    try {
      await act(async () => {
        root.render(<ChatPanel />)
      })

      const newsButton = container.querySelector<HTMLButtonElement>('[aria-label="快捷动作：看新闻"]')
      expect(newsButton).toBeTruthy()

      const input = getMessageInput(container)
      await act(async () => {
        Simulate.click(newsButton!)
      })

      expect(input.value).toContain('今天（2026年5月14日）')
      expect(input.value).toContain('仅使用2026年5月14日发布或更新的来源')
    } finally {
      vi.useRealTimers()
    }
  })

  it('disables quick action buttons while a message is loading', async () => {
    installChatPanelSendMessageMock('test-api-key', true)

    await act(async () => {
      root.render(<ChatPanel />)
    })

    const input = getMessageInput(container)
    await act(async () => {
      Simulate.change(input, { target: { value: '你好' } } as any)
    })

    const sendButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Send')
    expect(sendButton).toBeTruthy()
    await act(async () => {
      Simulate.click(sendButton!)
      await Promise.resolve()
      await Promise.resolve()
    })

    const quickButtons = ['看新闻', '找工作', '总结当前页'].map(label => {
      const button = container.querySelector<HTMLButtonElement>(`[aria-label="快捷动作：${label}"]`)
      expect(button).toBeTruthy()
      return button!
    })
    expect(quickButtons.every(button => button.disabled)).toBe(true)
  })

  it('does not send a real task and shows setup guidance when the selected provider has no API key', async () => {
    await act(async () => {
      root.render(<ChatPanel />)
    })

    const input = getMessageInput(container)
    await act(async () => {
      Simulate.change(input, { target: { value: '你好' } } as any)
    })

    const sendButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Send')
    expect(sendButton).toBeTruthy()
    await act(async () => {
      Simulate.click(sendButton!)
      await Promise.resolve()
    })

    const sentTypes = vi.mocked(chrome.runtime.sendMessage as any).mock.calls.map(([message]: any[]) => (message as { type: MessageType }).type)
    expect(sentTypes).toContain(MessageType.GET_PROVIDERS)
    expect(sentTypes).toContain(MessageType.GET_GENERAL_SETTINGS)
    expect(sentTypes).not.toContain(MessageType.USER_MESSAGE)
    expect(container.textContent).toContain('请先完成模型配置')
    expect(container.textContent).toContain('填写 API Key')
    expect(container.textContent).toContain('打开设置页')
  })

  it('restores focus to the message input after sending successfully', async () => {
    installChatPanelSendMessageMock('test-api-key')

    await act(async () => {
      root.render(<ChatPanel />)
    })

    const input = getMessageInput(container)
    await act(async () => {
      input.focus()
      Simulate.change(input, { target: { value: '你好' } } as any)
    })

    const sendButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Send')
    expect(sendButton).toBeTruthy()
    await act(async () => {
      Simulate.click(sendButton!)
      await Promise.resolve()
    })

    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
  })

  it('does not send a user message when Enter is pressed during composition', async () => {
    installChatPanelSendMessageMock('test-api-key')

    await act(async () => {
      root.render(<ChatPanel />)
    })

    const input = getMessageInput(container)
    await act(async () => {
      Simulate.change(input, { target: { value: '你好' } } as any)
    })

    const enterDuringComposition = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(enterDuringComposition, 'isComposing', { value: true })

    await act(async () => {
      input.dispatchEvent(enterDuringComposition)
      await Promise.resolve()
    })

    const sentTypes = vi.mocked(chrome.runtime.sendMessage as any).mock.calls.map(([message]: any[]) => (message as { type: MessageType }).type)
    expect(sentTypes).not.toContain(MessageType.USER_MESSAGE)
    expect(sentTypes).not.toContain(MessageType.GET_PROVIDERS)
    expect(enterDuringComposition.defaultPrevented).toBe(false)
  })

})
