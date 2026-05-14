import { useState, useEffect, useCallback } from 'react'
import type { ProviderConfig, GeneralSettingsConfig } from '@shared/types'

const BUILTIN_PROVIDERS = [
  { id: 'claude', name: 'Anthropic (Claude)', defaultModels: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  { id: 'openai', name: 'OpenAI', defaultModels: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o'] },
  { id: 'gemini', name: 'Google (Gemini)', defaultModels: ['gemini-3-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-pro'] },
  { id: 'deepseek', name: 'DeepSeek', defaultModels: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'qwen', name: 'Qwen', defaultModels: ['qwen3.6-plus', 'qwen-max', 'qwen-plus'] },
]

interface ProvidersTabProps {
  isDarkMode: boolean
}

export default function ProvidersTab({ isDarkMode }: ProvidersTabProps) {
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>({})
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [modelInputs, setModelInputs] = useState<Record<string, string>>({})
  const [settings, setSettings] = useState<GeneralSettingsConfig | null>(null)

  const loadProviders = useCallback(async () => {
    const res = await chrome.runtime.sendMessage({
      type: 'GET_PROVIDERS',
      requestId: crypto.randomUUID(),
    })
    if (res?.payload) setProviders(res.payload as Record<string, ProviderConfig>)
  }, [])

  const loadSettings = useCallback(async () => {
    const res = await chrome.runtime.sendMessage({
      type: 'GET_GENERAL_SETTINGS',
      requestId: crypto.randomUUID(),
    })
    if (res?.payload) setSettings(res.payload as GeneralSettingsConfig)
  }, [])

  useEffect(() => {
    loadProviders()
    loadSettings()
  }, [loadProviders, loadSettings])

  function send(type: string, payload: unknown) {
    return chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload })
  }

  async function handleSave(providerId: string, config: ProviderConfig) {
    setProviders(prev => ({ ...prev, [providerId]: config }))
    await send('SET_PROVIDER', { providerId, config })
  }

  async function updateGeneralSettings(patch: Partial<GeneralSettingsConfig>) {
    setSettings(prev => prev ? { ...prev, ...patch } : prev)
    await send('UPDATE_GENERAL_SETTINGS', patch)
  }

  async function handleQuickProviderChange(providerId: string) {
    await updateGeneralSettings({ defaultProvider: providerId })
  }

  async function handleQuickModelChange(model: string) {
    await updateGeneralSettings({ defaultModel: model })
  }

  async function handleQuickApiKeyChange(apiKey: string) {
    if (!settings) return
    const providerId = settings.defaultProvider
    const config = providers[providerId]
    if (!config) return
    await handleSave(providerId, { ...config, apiKey })
  }

  async function handleDelete(providerId: string) {
    await send('REMOVE_PROVIDER', { providerId })
    setProviders(prev => {
      const next = { ...prev }
      delete next[providerId]
      return next
    })
    if (expandedProvider === providerId) setExpandedProvider(null)
  }

  async function addProvider(id: string, name: string, models: string[]) {
    const config: ProviderConfig = {
      apiKey: '',
      modelNames: models,
      enabled: true,
    }
    if (id === 'custom') {
      const customId = `custom_${Date.now()}`
      config.apiKey = ''
      config.baseUrl = ''
      config.modelNames = []
      setProviders(prev => ({ ...prev, [customId]: { ...config, name } as ProviderConfig }))
      setExpandedProvider(customId)
    } else {
      setProviders(prev => ({ ...prev, [id]: config }))
      setExpandedProvider(id)
    }
    setShowAddMenu(false)
  }

  const cardBg = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
  const inputBg = isDarkMode
    ? 'bg-gray-800 border-gray-700 text-gray-100 focus:border-indigo-500'
    : 'bg-white border-gray-300 text-gray-900 focus:border-indigo-500'
  const mutedPanelBg = isDarkMode ? 'bg-indigo-950/30 border-indigo-900' : 'bg-indigo-50 border-indigo-100'
  const currentProviderId = settings?.defaultProvider || Object.keys(providers)[0] || ''
  const currentProvider = currentProviderId ? providers[currentProviderId] : undefined
  const quickSetupModels = currentProvider?.modelNames || []
  const quickSetupModelValue = settings?.defaultModel && quickSetupModels.includes(settings.defaultModel) ? settings.defaultModel : ''

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold">LLM Providers</h2>

      <section className={`mb-6 rounded-xl border ${mutedPanelBg} p-4 shadow-sm`}>
        <div className="mb-4">
          <h3 className="text-base font-semibold">一步式模型配置</h3>
          <p className="mt-1 text-sm opacity-70">先选择 provider 和模型；API Key 只需在发送任务前填写。</p>
        </div>

        {settings ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium">Provider</label>
              <select
                value={currentProviderId}
                onChange={e => handleQuickProviderChange(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
              >
                {Object.entries(providers).map(([id, config]) => (
                  <option key={id} value={id}>{config.name || id}{config.enabled ? '' : ' (disabled)'}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Model</label>
              <select
                value={quickSetupModelValue}
                onChange={e => handleQuickModelChange(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
              >
                {!quickSetupModelValue && <option value="">Select a model</option>}
                {quickSetupModels.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
              {quickSetupModels.length === 0 && (
                <p className="mt-1 text-xs opacity-60">该 provider 还没有模型，请先在下方添加模型。</p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">API Key <span className="font-normal opacity-70">（发送任务前必填）</span></label>
              <input
                type="password"
                value={currentProvider?.apiKey || ''}
                onChange={e => handleQuickApiKeyChange(e.target.value)}
                placeholder="发送任务前必填"
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
              />
            </div>
          </div>
        ) : (
          <div className="animate-pulse text-sm opacity-60">Loading provider settings…</div>
        )}
      </section>

      <div className="space-y-4">
        {Object.entries(providers).map(([id, config]) => (
          <div key={id} className={`rounded-xl border ${cardBg} shadow-sm`}>
            <button
              onClick={() => setExpandedProvider(expandedProvider === id ? null : id)}
              className="flex w-full items-center justify-between p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${config.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span className="font-medium">{config.name || id}</span>
              </div>
              <span className="text-sm opacity-50">{expandedProvider === id ? '▼' : '▶'}</span>
            </button>

            {expandedProvider === id && (
              <div className="border-t border-gray-200 dark:border-gray-800 p-4 space-y-4">
                {/* Enabled toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Enabled</span>
                  <button
                    onClick={() => handleSave(id, { ...config, enabled: !config.enabled })}
                    className={`relative h-6 w-11 rounded-full transition-colors ${config.enabled ? 'bg-indigo-600' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {/* API Key */}
                <div>
                  <label className="mb-1 block text-sm font-medium opacity-70">API Key</label>
                  <div className="flex gap-2">
                    <input
                      type={visibleKeys[id] ? 'text' : 'password'}
                      value={config.apiKey}
                      onChange={e => handleSave(id, { ...config, apiKey: e.target.value })}
                      placeholder="Enter API key"
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
                    />
                    <button
                      onClick={() => setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                    >
                      {visibleKeys[id] ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {/* Base URL (for custom providers) */}
                {id.startsWith('custom') && (
                  <div>
                    <label className="mb-1 block text-sm font-medium opacity-70">Base URL</label>
                    <input
                      type="text"
                      value={config.baseUrl || ''}
                      onChange={e => handleSave(id, { ...config, baseUrl: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
                    />
                  </div>
                )}

                {/* Models */}
                <div>
                  <label className="mb-1 block text-sm font-medium opacity-70">Models</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {config.modelNames.map(model => (
                      <span
                        key={model}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                          isDarkMode ? 'bg-indigo-900/50 text-indigo-200' : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {model}
                        <button
                          onClick={() => handleSave(id, {
                            ...config,
                            modelNames: config.modelNames.filter(m => m !== model),
                          })}
                          className="ml-1 opacity-60 hover:opacity-100"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={modelInputs[id] || ''}
                      onChange={e => setModelInputs(prev => ({ ...prev, [id]: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && modelInputs[id]?.trim()) {
                          handleSave(id, {
                            ...config,
                            modelNames: [...config.modelNames, modelInputs[id].trim()],
                          })
                          setModelInputs(prev => ({ ...prev, [id]: '' }))
                        }
                      }}
                      placeholder="Add model name (Enter to add)"
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
                    />
                  </div>
                </div>

                {/* Delete button */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => handleDelete(id)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Delete Provider
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Provider */}
      <div className="relative mt-6">
        <button
          onClick={() => setShowAddMenu(prev => !prev)}
          className={`w-full rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm font-medium transition-colors ${
            isDarkMode
              ? 'border-gray-700 text-gray-400 hover:border-indigo-500 hover:text-indigo-400'
              : 'border-gray-300 text-gray-500 hover:border-indigo-500 hover:text-indigo-600'
          }`}
        >
          + Add Provider
        </button>

        {showAddMenu && (
          <div className={`absolute z-10 mt-2 w-full overflow-hidden rounded-lg border shadow-lg ${
            isDarkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'
          }`}>
            {BUILTIN_PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => addProvider(p.id, p.name, p.defaultModels)}
                className={`w-full px-4 py-3 text-left text-sm transition-colors ${
                  isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-50'
                }`}
              >
                {p.name}
              </button>
            ))}
            <button
              onClick={() => addProvider('custom', 'Custom OpenAI-Compatible', [])}
              className={`w-full border-t px-4 py-3 text-left text-sm transition-colors ${
                isDarkMode
                  ? 'border-gray-800 hover:bg-gray-800'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              Custom OpenAI-Compatible Provider
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
