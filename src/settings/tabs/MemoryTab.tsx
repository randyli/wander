import { useState, useEffect, useCallback } from 'react'
import type { Episode, KnowledgeEntry } from '@shared/types'

interface SessionMemoryData { topic: string; intent: string; updatedAt: number }
interface SystemMemoryData { profile: string; builtAt: number }

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

type SubTab = 'session' | 'system' | 'knowledge' | 'episodic'
const SUB_TABS: SubTab[] = ['session', 'system', 'knowledge', 'episodic']

export default function MemoryTab({ isDarkMode }: MemoryTabProps) {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([])
  const [sessionMem, setSessionMem] = useState<SessionMemoryData | null>(null)
  const [systemMem, setSystemMem] = useState<SystemMemoryData | null>(null)
  const [subTab, setSubTab] = useState<SubTab>('session')

  const load = useCallback(async () => {
    const [ep, kn, sess, sys] = await Promise.all([
      send('LIST_EPISODES'),
      send('LIST_KNOWLEDGE'),
      send('GET_SESSION_MEMORY'),
      send('GET_SYSTEM_MEMORY'),
    ])
    setEpisodes((ep.payload as Episode[]).sort((a, b) => b.createdAt - a.createdAt))
    setKnowledge(kn.payload as KnowledgeEntry[])
    setSessionMem(sess.payload as SessionMemoryData | null)
    setSystemMem(sys.payload as SystemMemoryData | null)
  }, [])

  useEffect(() => { load() }, [load])

  const cardBg = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
  const subTabBg = isDarkMode ? 'bg-gray-800 text-gray-400 hover:text-gray-200' : 'bg-gray-100 text-gray-600 hover:text-gray-900'
  const subTabActive = isDarkMode ? 'bg-indigo-600/20 text-indigo-400' : 'bg-indigo-100 text-indigo-700'

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold">Memory</h2>

      {/* Sub-tabs */}
      <div className="mb-6 flex gap-2">
        {SUB_TABS.map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              subTab === t ? subTabActive : subTabBg
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Session Memory */}
      {subTab === 'session' && (
        <div>
          {!sessionMem ? (
            <p className="text-sm text-gray-400">No session memory yet. Start a conversation first.</p>
          ) : (
            <div className={`rounded-xl border ${cardBg} p-5 shadow-sm`}>
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

      {/* System Memory */}
      {subTab === 'system' && (
        <div>
          {!systemMem ? (
            <p className="text-sm text-gray-400">No system memory yet. It will be built from your browser history and bookmarks.</p>
          ) : (
            <div className={`rounded-xl border ${cardBg} p-5 shadow-sm`}>
              <div className="mb-3 text-xs font-medium uppercase tracking-wide opacity-50">User Profile</div>
              <div className="text-sm leading-relaxed">{systemMem.profile}</div>
              <div className="mt-4 text-xs opacity-40">Built at {new Date(systemMem.builtAt).toLocaleString()}</div>
            </div>
          )}
        </div>
      )}

      {/* Episodic Memory */}
      {subTab === 'episodic' && (
        <div>
          {episodes.length === 0 && <p className="text-sm text-gray-400">No episodes yet.</p>}
          <div className="space-y-3">
            {episodes.map(ep => (
              <div key={ep.id} className={`flex items-start justify-between rounded-xl border ${cardBg} p-4 shadow-sm`}>
                <div className="flex-1">
                  <div className="text-sm">{ep.summary}</div>
                  <div className="mt-1 text-xs opacity-40">{ep.domain} · {new Date(ep.createdAt).toLocaleDateString()}</div>
                </div>
                <button
                  onClick={async () => { await send('DELETE_EPISODE', { id: ep.id }); load() }}
                  className="ml-3 rounded p-1 text-lg leading-none text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge */}
      {subTab === 'knowledge' && (
        <div>
          {knowledge.length === 0 && <p className="text-sm text-gray-400">No knowledge entries yet.</p>}
          <div className="space-y-3">
            {knowledge.map(kn => (
              <div key={kn.key} className={`rounded-xl border ${cardBg} p-4 shadow-sm`}>
                <div className="flex items-start justify-between">
                  <div className="text-sm font-medium">{kn.key}</div>
                  <button
                    onClick={async () => { await send('DELETE_KNOWLEDGE', { key: kn.key }); load() }}
                    className="rounded p-1 text-lg leading-none text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-1 text-sm opacity-70">{kn.value}</div>
                {kn.tags.length > 0 && (
                  <div className="mt-2 flex gap-1.5 flex-wrap">
                    {kn.tags.map(tag => (
                      <span key={tag} className={`rounded-full px-2 py-0.5 text-xs ${isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                        {tag}
                      </span>
                    ))}
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
