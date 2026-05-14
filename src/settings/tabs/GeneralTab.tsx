import { useState, useEffect, useCallback } from 'react'
import type { ProviderConfig, GeneralSettingsConfig } from '@shared/types'

interface GeneralTabProps {
  isDarkMode: boolean
}

export default function GeneralTab({ isDarkMode }: GeneralTabProps) {
  const [settings, setSettings] = useState<GeneralSettingsConfig | null>(null)
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>({})
  const [saved, setSaved] = useState(false)
  const [visibleKey, setVisibleKey] = useState(false)

  const load = useCallback(async () => {
    const [settingsRes, providersRes] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_GENERAL_SETTINGS', requestId: crypto.randomUUID() }),
      chrome.runtime.sendMessage({ type: 'GET_PROVIDERS', requestId: crypto.randomUUID() }),
    ])
    if (settingsRes?.payload) setSettings(settingsRes.payload as GeneralSettingsConfig)
    if (providersRes?.payload) setProviders(providersRes.payload as Record<string, ProviderConfig>)
  }, [])

  useEffect(() => { load() }, [load])

  function send(type: string, payload: unknown) {
    return chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload })
  }

  function showSaved() {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function updateField<K extends keyof GeneralSettingsConfig>(key: K, value: GeneralSettingsConfig[K]) {
    if (!settings) return
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    await send('UPDATE_GENERAL_SETTINGS', { [key]: value })
    showSaved()
  }

  async function updateProvider(providerId: string, config: ProviderConfig) {
    setProviders(prev => ({ ...prev, [providerId]: config }))
    await send('SET_PROVIDER', { providerId, config })
    showSaved()
  }

  async function handleProviderChange(providerId: string) {
    if (!settings) return
    const provider = providers[providerId]
    const nextModel = provider?.modelNames[0] ?? ''
    const updated = { ...settings, provider: providerId, model: nextModel }
    setSettings(updated)
    await send('UPDATE_GENERAL_SETTINGS', { provider: providerId, model: nextModel })
    showSaved()
  }

  async function resetToDefaults() {
    await send('RESET_GENERAL_SETTINGS', {})
    await load()
    showSaved()
  }

  if (!settings || Object.keys(providers).length === 0) return <div className="animate-pulse space-y-4"><div className="h-8 w-48 rounded bg-gray-200" /><div className="h-32 rounded bg-gray-200" /></div>

  const providerEntries = Object.entries(providers)
  const selectedProviderConfig = providers[settings.provider]
  const availableModels = selectedProviderConfig?.modelNames || []
  const cardBg = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
  const inputBg = isDarkMode
    ? 'bg-gray-800 border-gray-700 text-gray-100 focus:border-indigo-500'
    : 'bg-white border-gray-300 text-gray-900 focus:border-indigo-500'

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">General Settings</h2>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>

      <div className={`space-y-6 rounded-xl border ${cardBg} p-6 shadow-sm`}>
        {/* LLM Settings */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">LLM Settings</h3>
            <p className="mt-1 text-xs opacity-60">Choose the provider and model Wander should use, then enter the API key for that provider.</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Provider</label>
            <select
              value={settings.provider}
              onChange={e => handleProviderChange(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
            >
              {providerEntries.map(([id, config]) => (
                <option key={id} value={id}>{config.name || id}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Model</label>
            <select
              value={settings.model}
              onChange={e => updateField('model', e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
            >
              {availableModels.length > 0 ? (
                availableModels.map(m => <option key={m} value={m}>{m}</option>)
              ) : (
                <option value="">No models available for this provider</option>
              )}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">API Key</label>
            <div className="flex gap-2">
              <input
                type={visibleKey ? 'text' : 'password'}
                value={selectedProviderConfig?.apiKey ?? ''}
                onChange={e => selectedProviderConfig && updateProvider(settings.provider, { ...selectedProviderConfig, apiKey: e.target.value })}
                placeholder="Enter API key"
                className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
              />
              <button
                type="button"
                onClick={() => setVisibleKey(prev => !prev)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {visibleKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {settings.provider.startsWith('custom') && selectedProviderConfig && (
            <div>
              <label className="mb-2 block text-sm font-medium">Base URL</label>
              <input
                type="text"
                value={selectedProviderConfig.baseUrl || ''}
                onChange={e => updateProvider(settings.provider, { ...selectedProviderConfig, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
              />
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 pt-6 dark:border-gray-800">
          <label className="mb-2 block text-sm font-medium">Max Tool Calls Per Task</label>
          <input
            type="number"
            min={1}
            max={100}
            value={settings.maxToolCallsPerTask}
            onChange={e => updateField('maxToolCallsPerTask', Math.max(1, Number(e.target.value)))}
            className={`w-32 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
          />
        </div>

        {/* Max Episodes */}
        <div>
          <label className="mb-2 block text-sm font-medium">Max Episodes</label>
          <input
            type="number"
            min={10}
            max={1000}
            value={settings.maxEpisodes}
            onChange={e => updateField('maxEpisodes', Math.max(10, Number(e.target.value)))}
            className={`w-32 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
          />
        </div>


        {/* Memory Settings */}
        <div className="space-y-4 border-t border-gray-200 pt-6 dark:border-gray-800">
          <div>
            <h3 className="text-sm font-semibold">Memory Settings</h3>
            <p className="mt-1 text-xs opacity-60">Control which browser sources can be used for system memory and how long memory is retained.</p>
          </div>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Allow system memory to read history</span>
            <input
              type="checkbox"
              checked={settings.enableHistoryMemory}
              onChange={e => updateField('enableHistoryMemory', e.target.checked)}
              className="h-4 w-4 accent-indigo-600"
            />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Allow system memory to read bookmarks</span>
            <input
              type="checkbox"
              checked={settings.enableBookmarkMemory}
              onChange={e => updateField('enableBookmarkMemory', e.target.checked)}
              className="h-4 w-4 accent-indigo-600"
            />
          </label>
          <div>
            <label className="mb-2 block text-sm font-medium">Memory Retention Days</label>
            <input
              type="number"
              min={1}
              max={3650}
              value={settings.memoryRetentionDays}
              onChange={e => updateField('memoryRetentionDays', Math.max(1, Number(e.target.value)))}
              className={`w-32 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
            />
          </div>
        </div>

        {/* Reset */}
        <div className="border-t border-gray-200 pt-6 dark:border-gray-800">
          <button
            onClick={resetToDefaults}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  )
}
