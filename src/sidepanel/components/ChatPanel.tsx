import { useState, useRef, useEffect } from 'react'
import { MessageType, isToolApprovalRequestMessage } from '@shared/messages'
import type { ToolApprovalRequestMessage } from '@shared/messages'
import MessageBubble from './MessageBubble'

interface Message { id: string; role: 'user' | 'assistant'; content: string; agentName?: string; thinking?: string }

interface PendingApproval {
  requestId: string
  payload: ToolApprovalRequestMessage['payload']
}

type WorkerResponse = { payload: { text: string; agentName: string; thinking?: string } } | { error: string }

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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])


  useEffect(() => {
    const listener = (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
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

  function formatParams(params: Record<string, unknown>): string {
    try { return JSON.stringify(params, null, 2) } catch { return String(params) }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: text }])
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
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 16px', borderBottom: '1px solid #f3f4f6' }}>
        <button onClick={handleClear} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>清除历史</button>
      </div>
      {pendingApproval && (
        <div style={{ margin: '8px 16px', padding: 12, border: '1px solid #f59e0b', borderRadius: 10, background: '#fffbeb', color: '#92400e' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>需要确认高风险工具</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div><strong>工具:</strong> {pendingApproval.payload.tool}</div>
            <div><strong>风险等级:</strong> {pendingApproval.payload.risk}</div>
            <div><strong>目标 URL:</strong> {pendingApproval.payload.targetUrl || '当前页面'}</div>
            <div><strong>参数:</strong></div>
            <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto', margin: '4px 0 8px', padding: 8, borderRadius: 6, background: '#fff7ed', color: '#7c2d12' }}>
              {formatParams(pendingApproval.payload.params)}
            </pre>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
