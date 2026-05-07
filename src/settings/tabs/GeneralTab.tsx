import { useState, useEffect, useCallback } from 'react'
import type { ProviderConfig, GeneralSettingsConfig } from '@shared/types'

interface GeneralTabProps {
  isDarkMode: boolean
}

export default function GeneralTab({ isDarkMode }: GeneralTabProps) {
  const [settings, setSettings] = useState<GeneralSettingsConfig | null>(null)
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>({})
  const [saved, setSaved] = useState(false)

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

  async function updateField<K extends keyof GeneralSettingsConfig>(key: K, value: GeneralSettingsConfig[K]) {
    if (!settings) return
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    await send('UPDATE_GENERAL_SETTINGS', { [key]: value })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function resetToDefaults() {
    await send('RESET_GENERAL_SETTINGS', {})
    await load()
  }

  if (!settings || Object.keys(providers).length === 0) return <div className="animate-pulse space-y-4"><div className="h-8 w-48 rounded bg-gray-200" /><div className="h-32 rounded bg-gray-200" /></div>

  const enabledProviders = Object.entries(providers).filter(([, c]) => c.enabled)
  const cardBg = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
  const inputBg = isDarkMode
    ? 'bg-gray-800 border-gray-700 text-gray-100 focus:border-indigo-500'
    : 'bg-white border-gray-300 text-gray-900 focus:border-indigo-500'

  // Get models for the selected provider
  const selectedProviderConfig = providers[settings.defaultProvider]
  const availableModels = selectedProviderConfig?.modelNames || []

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">General Settings</h2>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>

      <div className={`space-y-6 rounded-xl border ${cardBg} p-6 shadow-sm`}>
        {/* Default Provider */}
        <div>
          <label className="mb-2 block text-sm font-medium">Default Provider</label>
          <select
            value={settings.defaultProvider}
            onChange={e => updateField('defaultProvider', e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
          >
            {enabledProviders.map(([id, config]) => (
              <option key={id} value={id}>{config.name || id}</option>
            ))}
          </select>
        </div>

        {/* Default Model */}
        <div>
          <label className="mb-2 block text-sm font-medium">Default Model</label>
          <select
            value={settings.defaultModel}
            onChange={e => updateField('defaultModel', e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
          >
            {availableModels.length > 0 ? (
              availableModels.map(m => <option key={m} value={m}>{m}</option>)
            ) : (
              <option value="">No models available — add models in the Providers tab</option>
            )}
          </select>
          {availableModels.length === 0 && (
            <p className="mt-1 text-xs opacity-60">Configure models for this provider in the Providers tab first.</p>
          )}
        </div>

        {/* Max Tool Calls */}
        <div>
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

        {/* Reset */}
        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={resetToDefaults}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  )
}
