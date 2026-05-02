import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  role: 'user' | 'assistant'
  content: string
  agentName?: string
  thinking?: string
}

const markdownStyles = `
  .md p { margin: 0 0 8px; }
  .md p:last-child { margin-bottom: 0; }
  .md ul, .md ol { margin: 0 0 8px 16px; padding: 0; }
  .md li { margin-bottom: 2px; }
  .md h1,.md h2,.md h3 { font-size: 14px; font-weight: 600; margin: 8px 0 4px; }
  .md code { background: rgba(0,0,0,0.08); border-radius: 3px; padding: 1px 4px; font-size: 12px; font-family: monospace; }
  .md pre { background: rgba(0,0,0,0.08); border-radius: 6px; padding: 8px; overflow-x: auto; margin: 0 0 8px; }
  .md pre code { background: none; padding: 0; }
  .md strong { font-weight: 600; }
  .md a { color: #6366f1; text-decoration: underline; }
  .md table { border-collapse: collapse; width: 100%; margin: 0 0 8px; font-size: 13px; }
  .md th, .md td { border: 1px solid rgba(0,0,0,0.15); padding: 4px 8px; text-align: left; }
  .md th { background: rgba(0,0,0,0.06); font-weight: 600; }
  .md tr:nth-child(even) { background: rgba(0,0,0,0.03); }
`

export default function MessageBubble({ role, content, agentName, thinking }: Props) {
  const isUser = role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      <style>{markdownStyles}</style>
      <div style={{
        maxWidth: '80%', padding: '8px 12px', borderRadius: 12,
        background: isUser ? '#6366f1' : '#f3f4f6',
        color: isUser ? '#fff' : '#111', fontSize: 14, lineHeight: 1.5,
      }}>
        {!isUser && agentName && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{agentName}</div>}
        {!isUser && thinking && (
          <details style={{ marginBottom: 8 }}>
            <summary style={{ fontSize: 12, color: '#6b7280', cursor: 'pointer', userSelect: 'none' }}>思考过程</summary>
            <div className="md" style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(0,0,0,0.04)', borderRadius: 6, fontSize: 12, color: '#6b7280' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{thinking}</ReactMarkdown>
            </div>
          </details>
        )}
        {isUser
          ? <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
          : <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>
        }
      </div>
    </div>
  )
}
