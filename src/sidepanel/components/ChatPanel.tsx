import { useState, useRef, useEffect } from 'react'
import { MessageType, isStreamChunkMessage, isTaskEventMessage, isToolApprovalRequestMessage } from '@shared/messages'
import type { TaskEventPayload, ToolApprovalRequestMessage } from '@shared/messages'
import { validateSelectedProviderConfig } from '@shared/providerConfig'
import type { MissingProviderConfigError } from '@shared/providerConfig'
import type { GeneralSettingsConfig, ProviderConfig } from '@shared/types'
import MessageBubble from './MessageBubble'
import TaskTimeline from './TaskTimeline'

interface Message { id: string; role: 'user' | 'assistant'; content: string; agentName?: string; thinking?: string }

interface PendingApproval {
  requestId: string
  payload: ToolApprovalRequestMessage['payload']
}

interface ApprovalParamRow {
  label: string
  value: string
}

type WorkerResponse = { payload: unknown } | { error: string | MissingProviderConfigError }

const TOOL_LABELS: Record<string, string> = {
  'dom.fill': '填写网页表单',
  'dom.submit': '提交表单',
  'nav.goto': '打开网页',
  'history.search': '查看浏览历史',
  'page.screenshot': '截取当前页面',
}

const RISK_LABELS: Record<ToolApprovalRequestMessage['payload']['risk'], { label: string; description: string }> = {
  read: { label: '读取', description: '读取页面或本地信息，不会修改网页。' },
  navigate: { label: '跳转', description: '会改变当前页面或打开新网页。' },
  write: { label: '写入', description: '会保存或修改数据。' },
  submit: { label: '提交', description: '可能向网站发送表单内容。' },
  sensitive: { label: '敏感', description: '可能读取或填写敏感信息。' },
}


function isMissingProviderConfigError(error: unknown): error is MissingProviderConfigError {
  return typeof error === 'object' && error !== null && (error as MissingProviderConfigError).code === 'MISSING_PROVIDER_CONFIG'
}

function providerConfigReasonText(reason: MissingProviderConfigError['reason']): string {
  switch (reason) {
    case 'PROVIDER_NOT_FOUND': return '当前选择的 provider 尚未配置。'
    case 'API_KEY_MISSING': return '当前选择的 provider 还没有填写 API Key。'
    case 'MODEL_NOT_AVAILABLE': return '当前选择的模型不在该 provider 的模型列表中。'
  }
}

function ProviderConfigGuideCard({ error, onOpenSettings }: { error: MissingProviderConfigError; onOpenSettings: () => void }) {
  return (
    <div style={{ marginBottom: 12, padding: 14, border: '1px solid #f59e0b', borderRadius: 12, background: '#fffbeb', color: '#92400e', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>请先完成模型配置</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>
        {providerConfigReasonText(error.reason)}当前选择：provider <strong>{error.provider}</strong>，模型 <strong>{error.model || '未选择'}</strong>。
      </div>
      <ol style={{ margin: '0 0 12px 18px', padding: 0, fontSize: 13, lineHeight: 1.7 }}>
        <li>打开设置页。</li>
        <li>在 Providers 中选择并启用 provider。</li>
        <li>填写 API Key。</li>
        <li>在通用设置中选择该 provider 支持的模型。</li>
      </ol>
      <button onClick={onOpenSettings} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
        打开设置页
      </button>
    </div>
  )
}

const PARAM_LABELS: Record<string, string> = {
  selector: '页面位置',
  value: '填写内容',
  submit: '填写后提交',
  url: '目标网址',
  new_tab: '打开新标签页',
  direction: '方向',
  query: '搜索关键词',
  max_results: '最多结果数',
  days_back: '搜索最近天数',
}

function stringifyParamValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '未提供'
  if (value === true || value === 'true') return '是'
  if (value === false || value === 'false') return '否'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (Array.isArray(value)) return value.map(stringifyParamValue).join('、') || '空列表'
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>)
    .map(([key, val]) => `${PARAM_LABELS[key] ?? key}: ${stringifyParamValue(val)}`)
    .join('；') || '空对象'
  return String(value)
}

export function getApprovalToolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool
}

export function getApprovalRiskLabel(risk: ToolApprovalRequestMessage['payload']['risk']): string {
  const details = RISK_LABELS[risk]
  return details ? `${details.label}风险：${details.description}` : risk
}

export function getApprovalParamRows(tool: string, params: Record<string, unknown>): ApprovalParamRow[] {
  const rows = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => ({ label: PARAM_LABELS[key] ?? key, value: stringifyParamValue(value) }))

  if (tool === 'history.search' && !('query' in params)) {
    rows.unshift({ label: '搜索范围', value: '最近浏览记录' })
  }
  if (tool === 'page.screenshot' && rows.length === 0) {
    rows.push({ label: '截图范围', value: '当前可见页面' })
  }
  if (tool === 'dom.submit' && !('selector' in params)) {
    rows.push({ label: '提交表单', value: '页面中的第一个表单' })
  }
  return rows
}

function sendToWorker(type: MessageType, payload: unknown): Promise<WorkerResponse> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload }, r => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else if (r === undefined) reject(new Error('Service worker did not respond. Check chrome://extensions for errors.'))
      else resolve(r)
    })
  )
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState('default')
  const [taskStatus, setTaskStatus] = useState<'idle' | 'running' | 'done' | 'cancelled' | 'error'>('idle')
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null)
  const [taskEvents, setTaskEvents] = useState<TaskEventPayload[]>([])
  const [providerConfigError, setProviderConfigError] = useState<MissingProviderConfigError | null>(null)
  const approvalResponderRef = useRef<((response: unknown) => void) | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sendToWorker(MessageType.GET_HISTORY, { conversationId }).then(r => {
      if ('payload' in r) {
        const history = r.payload as Array<{ role: string; content: string }>
        setMessages(history.map(m => ({
          id: crypto.randomUUID(),
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })))
      }
    }).catch(() => {})
  }, [conversationId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, taskEvents])

  useEffect(() => {
    const listener = (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
      if (isStreamChunkMessage(message)) {
        if (message.payload.conversationId && message.payload.conversationId !== conversationId) return false
        setMessages(prev => prev.map(m => m.id === message.payload.taskId ? { ...m, content: m.content + message.payload.text } : m))
        if (message.payload.done) {
          setTaskStatus('done')
          setCurrentTaskId(null)
        }
        return false
      }
      if (isTaskEventMessage(message)) {
        setTaskEvents(prev => [...prev, message.payload])
        if (message.payload.status === 'cancelled') setTaskStatus('cancelled')
        else if (message.payload.status === 'error') setTaskStatus('error')
        else if (message.payload.status === 'running') setTaskStatus('running')
        return false
      }
      if (!isToolApprovalRequestMessage(message)) return false
      setPendingApproval({ requestId: message.requestId, payload: message.payload })
      approvalResponderRef.current = sendResponse
      return true
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [conversationId])

  function respondToApproval(approved: boolean) {
    if (!pendingApproval) return
    approvalResponderRef.current?.({
      type: MessageType.TOOL_APPROVAL_RESPONSE,
      requestId: pendingApproval.requestId,
      payload: { approved, reason: approved ? undefined : 'Rejected by user' },
    })
    approvalResponderRef.current = null
    setPendingApproval(null)
  }

  function openSettings() {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/settings/settings.html') })
  }

  async function checkProviderConfig(): Promise<MissingProviderConfigError | null> {
    const [providersResponse, settingsResponse] = await Promise.all([
      sendToWorker(MessageType.GET_PROVIDERS, {}),
      sendToWorker(MessageType.GET_GENERAL_SETTINGS, {}),
    ])
    if ('error' in providersResponse) {
      if (isMissingProviderConfigError(providersResponse.error)) return providersResponse.error
      throw new Error(String(providersResponse.error))
    }
    if ('error' in settingsResponse) {
      if (isMissingProviderConfigError(settingsResponse.error)) return settingsResponse.error
      throw new Error(String(settingsResponse.error))
    }
    return validateSelectedProviderConfig(
      settingsResponse.payload as GeneralSettingsConfig,
      providersResponse.payload as Record<string, ProviderConfig>,
    )
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    try {
      const configError = await checkProviderConfig()
      if (configError) {
        setProviderConfigError(configError)
        setTaskStatus('error')
        return
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `无法读取模型配置：${err}` }])
      setTaskStatus('error')
      return
    }

    setProviderConfigError(null)
    setInput('')
    const taskId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: text }, { id: taskId, role: 'assistant', content: '', agentName: 'assistant' }])
    setTaskEvents([])
    setCurrentTaskId(taskId)
    setTaskStatus('running')
    setLoading(true)
    try {
      const response = await sendToWorker(MessageType.USER_MESSAGE, { text, conversationId, taskId })
      if ('error' in response) {
        if (isMissingProviderConfigError(response.error)) {
          setProviderConfigError(response.error)
          setTaskStatus('error')
          return
        }
        throw new Error(String(response.error))
      }
      const responsePayload = response.payload as { text?: string; thinking?: string; agentName?: string }
      setMessages(prev => prev.map(msg => msg.id === taskId ? {
        ...msg,
        content: msg.content || responsePayload.text || '',
        thinking: responsePayload.thinking,
        agentName: responsePayload.agentName,
      } : msg))
      setTaskStatus('done')
    } catch (err) {
      setMessages(prev => prev.map(msg => msg.id === taskId ? { ...msg, content: msg.content || `Error: ${err}` } : msg))
      setTaskStatus(String(err).includes('cancelled') ? 'cancelled' : 'error')
    } finally {
      setLoading(false)
      setCurrentTaskId(null)
    }
  }

  async function handleClear() {
    await sendToWorker(MessageType.CLEAR_HISTORY, { conversationId })
    setMessages([])
    setTaskEvents([])
  }

  async function handleCancel() {
    if (!currentTaskId) return
    await sendToWorker(MessageType.CANCEL_TASK, { taskId: currentTaskId })
    setTaskStatus('cancelled')
    setLoading(false)
    setCurrentTaskId(null)
  }

  async function handleNewConversation() {
    const response = await sendToWorker(MessageType.CREATE_CONVERSATION, {})
    const responsePayload = 'payload' in response ? response.payload as { conversationId?: string } : null
    if (responsePayload?.conversationId) {
      setConversationId(responsePayload.conversationId)
      setMessages([])
      setTaskEvents([])
      setTaskStatus('idle')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 16px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: '#6b7280' }}>
          <span>状态：{taskStatus}</span>
          <button onClick={handleNewConversation} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>新会话</button>
          {loading && <button onClick={handleCancel} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>取消</button>}
        </div>
        <button onClick={handleClear} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>清除历史</button>
      </div>
      {pendingApproval && (
        <div style={{ margin: '8px 16px', padding: 12, border: '1px solid #f59e0b', borderRadius: 10, background: '#fffbeb', color: '#92400e' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>请确认这一步操作</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
            助手想要执行：<strong>{getApprovalToolLabel(pendingApproval.payload.tool)}</strong>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8, padding: 8, borderRadius: 6, background: '#fff7ed' }}>
            {getApprovalRiskLabel(pendingApproval.payload.risk)}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ marginBottom: 6 }}><strong>目标页面：</strong>{pendingApproval.payload.targetUrl || '当前页面'}</div>
            {getApprovalParamRows(pendingApproval.payload.tool, pendingApproval.payload.params).map(row => (
              <div key={row.label} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <span style={{ minWidth: 88, color: '#b45309' }}>{row.label}：</span>
                <span style={{ flex: 1, wordBreak: 'break-word' }}>{row.value}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <button onClick={() => respondToApproval(false)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #f59e0b', background: '#fff', color: '#92400e', cursor: 'pointer' }}>拒绝</button>
            <button onClick={() => respondToApproval(true)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer' }}>允许</button>
          </div>
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 }}>
            Start a conversation with your agent
          </div>
        )}
        {providerConfigError && <ProviderConfigGuideCard error={providerConfigError} onOpenSettings={openSettings} />}
        <TaskTimeline events={taskEvents} />
        {messages.map(msg => <MessageBubble key={msg.id} role={msg.role} content={msg.content} agentName={msg.agentName} thinking={msg.thinking} />)}
        {loading && !messages.some(m => m.id === currentTaskId && m.content) && <MessageBubble role="assistant" content="Thinking…" />}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '8px 16px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Message your agent…"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', opacity: loading || !input.trim() ? 0.5 : 1 }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
