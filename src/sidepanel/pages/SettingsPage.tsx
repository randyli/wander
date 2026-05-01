import { useState, useEffect } from 'react'
import { MessageType } from '@shared/messages'
import type { GlobalConfig, LLMProvider } from '@shared/types'

function send(type: MessageType, payload?: unknown): Promise<{ payload: unknown }> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload }, r =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
    )
  )
}

const PROVIDERS: LLMProvider[] = ['claude', 'openai', 'gemini']

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({ claude: '', openai: '', gemini: '' })
  const [config, setConfig] = useState<GlobalConfig>({ defaultProvider: 'claude', defaultModel: 'claude-opus-4-7', maxToolCallsPerTask: 20, maxEpisodes: 100 })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    send(MessageType.GET_CONFIG).then(r => { if (r.payload) setConfig(r.payload as GlobalConfig) })
  }, [])

  async function handleSave() {
    await send(MessageType.SET_CONFIG, { config })
    for (const provider of PROVIDERS) {
      if (apiKeys[provider]) await send(MessageType.SET_API_KEY, { provider, key: apiKeys[provider] })
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Settings</h2>
      <section style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>API Keys</h3>
        {PROVIDERS.map(provider => (
          <div key={provider} style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2, textTransform: 'capitalize' }}>{provider}</label>
            <input type="password" placeholder={`Enter ${provider} API key`} value={apiKeys[provider]} onChange={e => setApiKeys(prev => ({ ...prev, [provider]: e.target.value }))} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
          </div>
        ))}
      </section>
      <section style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>General</h3>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Default Model</label>
          <input value={config.defaultModel} onChange={e => setConfig(prev => ({ ...prev, defaultModel: e.target.value }))} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Max Tool Calls Per Task</label>
          <input type="number" value={config.maxToolCallsPerTask} onChange={e => setConfig(prev => ({ ...prev, maxToolCallsPerTask: Number(e.target.value) }))} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
        </div>
      </section>
      <button onClick={handleSave} style={{ width: '100%', padding: 8, borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 14 }}>
        {saved ? 'Saved' : 'Save Settings'}
      </button>
    </div>
  )
}
