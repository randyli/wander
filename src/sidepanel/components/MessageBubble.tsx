interface Props {
  role: 'user' | 'assistant'
  content: string
  agentName?: string
}

export default function MessageBubble({ role, content, agentName }: Props) {
  const isUser = role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      <div style={{
        maxWidth: '80%', padding: '8px 12px', borderRadius: 12,
        background: isUser ? '#6366f1' : '#f3f4f6',
        color: isUser ? '#fff' : '#111', fontSize: 14, lineHeight: 1.5,
      }}>
        {!isUser && agentName && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{agentName}</div>}
        <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
      </div>
    </div>
  )
}
