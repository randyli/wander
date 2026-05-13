import { useState, useEffect, useCallback } from 'react'
import type { Episode, KnowledgeEntry } from '@shared/types'

interface SessionMemoryData { topic: string; intent: string; updatedAt: number }
interface SystemMemoryData { profile: string; builtAt: number; sources?: { history: boolean; bookmarks: boolean } }

interface MemoryTabProps {
  isDarkMode: boolean
}

function send(type: string, payload?: unknown): Promise<{ payload: unknown }> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload }, r =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
    )
  )
}

function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type SubTab = 'knowledge' | 'episode' | 'session' | 'system'
const SUB_TABS: Array<{ id: SubTab; label: string; description: string }> = [
  { id: 'knowledge', label: 'Knowledge', description: 'Durable facts saved by key, tag, and optional domain.' },
  { id: 'episode', label: 'Episode', description: 'Conversation/task episodes grouped by tag and domain.' },
  { id: 'session', label: 'Session', description: 'Short-lived context inferred from the current chat.' },
  { id: 'system', label: 'System Memory', description: 'Profile inferred from enabled browser sources.' },
]

export default function MemoryTab({ isDarkMode }: MemoryTabProps) {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([])
  const [sessionMem, setSessionMem] = useState<SessionMemoryData | null>(null)
  const [systemMem, setSystemMem] = useState<SystemMemoryData | null>(null)
  const [subTab, setSubTab] = useState<SubTab>('knowledge')
  const [knowledgeFilter, setKnowledgeFilter] = useState('')
  const [episodeFilter, setEpisodeFilter] = useState('')

  const load = useCallback(async () => {
    const [ep, kn, sess, sys] = await Promise.all([
      send('LIST_EPISODES'),
      send('LIST_KNOWLEDGE'),
      send('GET_SESSION_MEMORY'),
      send('GET_SYSTEM_MEMORY'),
    ])
    setEpisodes((ep.payload as Episode[]).sort((a, b) => b.createdAt - a.createdAt))
    setKnowledge((kn.payload as KnowledgeEntry[]).sort((a, b) => b.updatedAt - a.updatedAt))
    setSessionMem(sess.payload as SessionMemoryData | null)
    setSystemMem(sys.payload as SystemMemoryData | null)
  }, [])

  useEffect(() => { load() }, [load])

  async function exportMemory(type: 'knowledge' | 'episode') {
    const message = type === 'knowledge' ? 'EXPORT_KNOWLEDGE' : 'EXPORT_EPISODES'
    const result = await send(message)
    downloadJson(`${type}-memory.json`, String(result.payload ?? '[]'))
  }

  async function deleteKnowledgeBy(kind: 'tag' | 'domain') {
    const value = knowledgeFilter.trim()
    if (!value) return
    await send(kind === 'tag' ? 'DELETE_KNOWLEDGE_BY_TAG' : 'DELETE_KNOWLEDGE_BY_DOMAIN', { [kind]: value })
    setKnowledgeFilter('')
    load()
  }

  async function deleteEpisodesBy(kind: 'tag' | 'domain') {
    const value = episodeFilter.trim()
    if (!value) return
    await send(kind === 'tag' ? 'DELETE_EPISODES_BY_TAG' : 'DELETE_EPISODES_BY_DOMAIN', { [kind]: value })
    setEpisodeFilter('')
    load()
  }

  const cardBg = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
  const inputBg = isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
  const subTabBg = isDarkMode ? 'bg-gray-800 text-gray-400 hover:text-gray-200' : 'bg-gray-100 text-gray-600 hover:text-gray-900'
  const subTabActive = isDarkMode ? 'bg-indigo-600/20 text-indigo-400' : 'bg-indigo-100 text-indigo-700'
  const actionButton = 'rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800'
  const dangerButton = 'rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20'

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold">Memory</h2>

      <div className="mb-6 grid gap-2 sm:grid-cols-4">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${subTab === t.id ? subTabActive : subTabBg}`}
          >
            <div>{t.label}</div>
            <div className="mt-1 text-xs font-normal opacity-60">{t.description}</div>
          </button>
        ))}
      </div>

      {subTab === 'session' && (
        <div>
          {!sessionMem ? (
            <p className="text-sm text-gray-400">No session memory yet. Start a conversation first.</p>
          ) : (
            <div className={`rounded-xl border ${cardBg} p-5 shadow-sm`}>
              <div className="mb-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide opacity-50">Source</div>
                <div className="text-sm">session</div>
              </div>
              <div className="mb-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide opacity-50">Topic</div>
                <div className="text-sm">{sessionMem.topic}</div>
              </div>
              <div className="mb-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide opacity-50">Intent</div>
                <div className="text-sm">{sessionMem.intent}</div>
              </div>
              <div className="text-xs opacity-40">Updated {new Date(sessionMem.updatedAt).toLocaleString()}</div>
            </div>
          )}
        </div>
      )}

      {subTab === 'system' && (
        <div>
          {!systemMem ? (
            <p className="text-sm text-gray-400">No system memory yet. It will be built only from enabled browser sources.</p>
          ) : (
            <div className={`rounded-xl border ${cardBg} p-5 shadow-sm`}>
              <div className="mb-3 text-xs font-medium uppercase tracking-wide opacity-50">Source: system</div>
              <div className="mb-3 flex gap-2 text-xs">
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">history: {systemMem.sources?.history ? 'enabled' : 'disabled'}</span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">bookmarks: {systemMem.sources?.bookmarks ? 'enabled' : 'disabled'}</span>
              </div>
              <div className="mb-3 text-xs font-medium uppercase tracking-wide opacity-50">User Profile</div>
              <div className="text-sm leading-relaxed">{systemMem.profile}</div>
              <div className="mt-4 text-xs opacity-40">Built at {new Date(systemMem.builtAt).toLocaleString()}</div>
            </div>
          )}
        </div>
      )}

      {subTab === 'episode' && (
        <div>
          <div className={`mb-4 rounded-xl border ${cardBg} p-4 shadow-sm`}>
            <div className="mb-3 text-xs font-medium uppercase tracking-wide opacity-50">Episode bulk actions</div>
            <div className="flex flex-wrap gap-2">
              <input value={episodeFilter} onChange={e => setEpisodeFilter(e.target.value)} placeholder="tag or domain" className={`rounded-lg border px-3 py-1.5 text-xs ${inputBg}`} />
              <button onClick={() => deleteEpisodesBy('tag')} className={dangerButton}>Delete by tag</button>
              <button onClick={() => deleteEpisodesBy('domain')} className={dangerButton}>Delete by domain</button>
              <button onClick={async () => { await send('CLEAR_EPISODES'); load() }} className={dangerButton}>Clear all</button>
              <button onClick={() => exportMemory('episode')} className={actionButton}>Export JSON</button>
            </div>
          </div>
          {episodes.length === 0 && <p className="text-sm text-gray-400">No episodes yet.</p>}
          <div className="space-y-3">
            {episodes.map(ep => (
              <div key={ep.id} className={`flex items-start justify-between rounded-xl border ${cardBg} p-4 shadow-sm`}>
                <div className="flex-1">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide opacity-50">Source: episode</div>
                  <div className="text-sm">{ep.summary}</div>
                  <div className="mt-1 text-xs opacity-40">{ep.domain} · {new Date(ep.createdAt).toLocaleDateString()}</div>
                  {ep.tags.length > 0 && <div className="mt-2 text-xs opacity-60">Tags: {ep.tags.join(', ')}</div>}
                </div>
                <button onClick={async () => { await send('DELETE_EPISODE', { id: ep.id }); load() }} className="ml-3 rounded p-1 text-lg leading-none text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'knowledge' && (
        <div>
          <div className={`mb-4 rounded-xl border ${cardBg} p-4 shadow-sm`}>
            <div className="mb-3 text-xs font-medium uppercase tracking-wide opacity-50">Knowledge bulk actions</div>
            <div className="flex flex-wrap gap-2">
              <input value={knowledgeFilter} onChange={e => setKnowledgeFilter(e.target.value)} placeholder="tag or domain" className={`rounded-lg border px-3 py-1.5 text-xs ${inputBg}`} />
              <button onClick={() => deleteKnowledgeBy('tag')} className={dangerButton}>Delete by tag</button>
              <button onClick={() => deleteKnowledgeBy('domain')} className={dangerButton}>Delete by domain</button>
              <button onClick={async () => { await send('CLEAR_KNOWLEDGE'); load() }} className={dangerButton}>Clear all</button>
              <button onClick={() => exportMemory('knowledge')} className={actionButton}>Export JSON</button>
            </div>
          </div>
          {knowledge.length === 0 && <p className="text-sm text-gray-400">No knowledge entries yet.</p>}
          <div className="space-y-3">
            {knowledge.map(kn => (
              <div key={kn.key} className={`rounded-xl border ${cardBg} p-4 shadow-sm`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide opacity-50">Source: knowledge</div>
                    <div className="text-sm font-medium">{kn.key}</div>
                  </div>
                  <button onClick={async () => { await send('DELETE_KNOWLEDGE', { key: kn.key }); load() }} className="rounded p-1 text-lg leading-none text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">×</button>
                </div>
                <div className="mt-1 text-sm opacity-70">{kn.value}</div>
                {kn.domain && <div className="mt-2 text-xs opacity-50">Domain: {kn.domain}</div>}
                {kn.tags.length > 0 && (
                  <div className="mt-2 flex gap-1.5 flex-wrap">
                    {kn.tags.map(tag => <span key={tag} className={`rounded-full px-2 py-0.5 text-xs ${isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{tag}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
