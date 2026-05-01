import { useState, useEffect } from 'react'
import { MessageType } from '@shared/messages'
import type { Episode, KnowledgeEntry } from '@shared/types'

function send(type: MessageType, payload?: unknown): Promise<{ payload: unknown }> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload }, r =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
    )
  )
}

export default function MemoryPage() {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([])
  const [tab, setTab] = useState<'episodic' | 'knowledge'>('episodic')

  async function load() {
    const [ep, kn] = await Promise.all([send(MessageType.LIST_EPISODES), send(MessageType.LIST_KNOWLEDGE)])
    setEpisodes((ep.payload as Episode[]).sort((a, b) => b.createdAt - a.createdAt))
    setKnowledge(kn.payload as KnowledgeEntry[])
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 12, fontSize: 15, fontWeight: 600 }}>Memory</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['episodic', 'knowledge'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: tab === t ? '#6366f1' : '#fff', color: tab === t ? '#fff' : '#374151', cursor: 'pointer', fontSize: 12, textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>
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
