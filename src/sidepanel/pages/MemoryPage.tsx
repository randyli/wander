import { useState, useEffect } from 'react'
import { MessageType } from '@shared/messages'
import type { Episode, KnowledgeEntry } from '@shared/types'

interface SessionMemoryData { topic: string; intent: string; updatedAt: number }
interface SystemMemoryData { profile: string; builtAt: number }

function send(type: MessageType, payload?: unknown): Promise<{ payload: unknown }> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload }, r =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
    )
  )
}

type Tab = 'episodic' | 'knowledge' | 'session' | 'system'

export default function MemoryPage() {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([])
  const [sessionMem, setSessionMem] = useState<SessionMemoryData | null>(null)
  const [systemMem, setSystemMem] = useState<SystemMemoryData | null>(null)
  const [tab, setTab] = useState<Tab>('session')

  async function load() {
    const [ep, kn, sess, sys] = await Promise.all([
      send(MessageType.LIST_EPISODES),
      send(MessageType.LIST_KNOWLEDGE),
      send(MessageType.GET_SESSION_MEMORY),
      send(MessageType.GET_SYSTEM_MEMORY),
    ])
    setEpisodes((ep.payload as Episode[]).sort((a, b) => b.createdAt - a.createdAt))
    setKnowledge(kn.payload as KnowledgeEntry[])
    setSessionMem(sess.payload as SessionMemoryData | null)
    setSystemMem(sys.payload as SystemMemoryData | null)
  }

  useEffect(() => { load() }, [])

  const tabs: Tab[] = ['session', 'system', 'knowledge', 'episodic']

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 12, fontSize: 15, fontWeight: 600 }}>Memory</h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: tab === t ? '#6366f1' : '#fff', color: tab === t ? '#fff' : '#374151', cursor: 'pointer', fontSize: 12, textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {tab === 'session' && (
        <div>
          {!sessionMem
            ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No session memory yet. Start a conversation first.</p>
            : (
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: 12 }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>话题</div>
                  <div style={{ fontSize: 13 }}>{sessionMem.topic}</div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>意图</div>
                  <div style={{ fontSize: 13 }}>{sessionMem.intent}</div>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>更新于 {new Date(sessionMem.updatedAt).toLocaleTimeString()}</div>
              </div>
            )}
        </div>
      )}

      {tab === 'system' && (
        <div>
          {!systemMem
            ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No system memory yet. It will be built from your browser history and bookmarks.</p>
            : (
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>用户画像</div>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>{systemMem.profile}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>构建于 {new Date(systemMem.builtAt).toLocaleString()}</div>
              </div>
            )}
        </div>
      )}

      {tab === 'episodic' && (
        <div>
          {episodes.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13 }}>No episodes yet.</p>}
          {episodes.map(ep => (
            <div key={ep.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13 }}>{ep.summary}</span>
                <button onClick={async () => { await send(MessageType.DELETE_EPISODE, { id: ep.id }); load() }} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>×</button>
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{ep.domain} · {new Date(ep.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'knowledge' && (
        <div>
          {knowledge.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13 }}>No knowledge entries yet.</p>}
          {knowledge.map(kn => (
            <div key={kn.key} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{kn.key}</span>
                <button onClick={async () => { await send(MessageType.DELETE_KNOWLEDGE, { key: kn.key }); load() }} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>×</button>
              </div>
              <div style={{ fontSize: 12, color: '#374151' }}>{kn.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
