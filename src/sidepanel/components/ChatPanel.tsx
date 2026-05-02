import { useState, useRef, useEffect } from 'react'
import { MessageType } from '@shared/messages'
import MessageBubble from './MessageBubble'

interface Message { id: string; role: 'user' | 'assistant'; content: string; agentName?: string; thinking?: string }

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
