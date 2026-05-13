import { useState, useRef, useEffect } from 'react'
import { MessageType, isTaskEventMessage, isToolApprovalRequestMessage } from '@shared/messages'
import type { TaskEventPayload, ToolApprovalRequestMessage } from '@shared/messages'
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

type WorkerResponse = { payload: { text: string; agentName: string; thinking?: string } } | { error: string }

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
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null)
  const [taskEvents, setTaskEvents] = useState<TaskEventPayload[]>([])
  const approvalResponderRef = useRef<((response: unknown) => void) | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sendToWorker(MessageType.GET_HISTORY, {}).then(r => {
      if ('payload' in r) {
        const history = r.payload as Array<{ role: string; content: string }>
        setMessages(history.map(m => ({
          id: crypto.randomUUID(),
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, taskEvents])


  useEffect(() => {
    const listener = (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
      if (isTaskEventMessage(message)) {
        setTaskEvents(prev => [...prev, message.payload])
        return false
      }
      if (!isToolApprovalRequestMessage(message)) return false
      setPendingApproval({ requestId: message.requestId, payload: message.payload })
      approvalResponderRef.current = sendResponse
      return true
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

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

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: text }])
    setTaskEvents([])
    setLoading(true)
    try {
      const response = await sendToWorker(MessageType.USER_MESSAGE, { text })
      if ('error' in response) throw new Error(response.error)
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant',
        content: response.payload.text,
        thinking: response.payload.thinking,
        agentName: response.payload.agentName,
      }])
    } catch (err) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${err}` }])
    } finally {
      setLoading(false)
    }
  }

  async function handleClear() {
    await sendToWorker(MessageType.CLEAR_HISTORY, {})
    setMessages([])
    setTaskEvents([])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 16px', borderBottom: '1px solid #f3f4f6' }}>
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
        <TaskTimeline events={taskEvents} />
        {messages.map(msg => <MessageBubble key={msg.id} role={msg.role} content={msg.content} agentName={msg.agentName} thinking={msg.thinking} />)}
        {loading && <MessageBubble role="assistant" content="Thinking…" />}
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
