import type { TaskEventPayload } from '@shared/messages'

interface TaskTimelineProps {
  events: TaskEventPayload[]
}

const EVENT_LABELS: Record<TaskEventPayload['eventType'], string> = {
  user_message: '用户消息',
  llm_response: 'LLM 响应',
  tool_start: '工具调用开始',
  tool_complete: '工具调用完成',
  tool_error: '工具错误',
  subagent_start: '子代理开始',
  subagent_complete: '子代理结束',
  subagent_error: '子代理错误',
  final_response: '最终回复',
}

const STATUS_COLORS: Record<TaskEventPayload['status'], string> = {
  pending: '#9ca3af',
  running: '#2563eb',
  success: '#16a34a',
  error: '#dc2626',
  cancelled: '#f97316',
}

function stringify(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function CollapsibleText({ text, maxLength = 320 }: { text: string; maxLength?: number }) {
  if (text.length <= maxLength) {
    return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</span>
  }

  return (
    <details style={{ marginTop: 4 }}>
      <summary style={{ cursor: 'pointer', color: '#4f46e5' }}>
        {text.slice(0, maxLength)}… 展开 {text.length - maxLength} 个字符
      </summary>
      <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto', background: '#f9fafb', padding: 8, borderRadius: 6 }}>
        {text}
      </pre>
    </details>
  )
}

export default function TaskTimeline({ events }: TaskTimelineProps) {
  if (events.length === 0) return null

  return (
    <div style={{ marginBottom: 12, padding: 10, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 8 }}>任务事件流</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {events.map((event, index) => {
          const params = stringify(event.params)
          const summary = event.summary ?? ''
          return (
            <div key={`${event.taskId}-${index}`} style={{ display: 'grid', gridTemplateColumns: '10px 1fr', gap: 8, fontSize: 12, lineHeight: 1.45 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: STATUS_COLORS[event.status], marginTop: 5 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong style={{ color: '#111827' }}>{EVENT_LABELS[event.eventType]}</strong>
                  <span style={{ color: '#6b7280' }}>{event.agentName}</span>
                  {event.toolName && <code style={{ color: '#4338ca', background: '#eef2ff', padding: '1px 4px', borderRadius: 4 }}>{event.toolName}</code>}
                </div>
                {summary && <CollapsibleText text={summary} />}
                {params && (
                  <details style={{ marginTop: 3 }}>
                    <summary style={{ cursor: 'pointer', color: '#6b7280' }}>参数</summary>
                    <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflow: 'auto', background: '#f9fafb', padding: 6, borderRadius: 6 }}>{params}</pre>
                  </details>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
