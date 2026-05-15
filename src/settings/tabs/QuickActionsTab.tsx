import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GeneralSettingsConfig, QuickActionConfig } from '@shared/types'
import type { QuickAction, QuickActionsPayload } from '@shared/messages'

interface QuickActionsTabProps {
  isDarkMode: boolean
}

function send(type: string, payload?: unknown): Promise<{ payload: unknown }> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload }, r =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
    )
  )
}

function createQuickAction(action?: Partial<QuickActionConfig>): QuickActionConfig {
  return {
    id: action?.id ?? crypto.randomUUID(),
    label: action?.label ?? '',
    prompt: action?.prompt ?? '',
    enabled: action?.enabled ?? true,
    source: action?.source ?? 'user',
  }
}

function fromRecommendation(action: QuickAction): QuickActionConfig {
  return createQuickAction({
    label: action.label,
    prompt: action.prompt,
    enabled: true,
    source: 'recommended',
  })
}

function serializeQuickSettings(settings: GeneralSettingsConfig): string {
  return JSON.stringify({
    quickActions: settings.quickActions ?? [],
    showRecommendedQuickActions: settings.showRecommendedQuickActions ?? true,
  })
}

export default function QuickActionsTab({ isDarkMode }: QuickActionsTabProps) {
  const [settings, setSettings] = useState<GeneralSettingsConfig | null>(null)
  const [recommendations, setRecommendations] = useState<QuickAction[]>([])
  const [saved, setSaved] = useState(false)
  const [lastSavedQuickSettings, setLastSavedQuickSettings] = useState('')

  const load = useCallback(async () => {
    const [settingsRes, recommendationRes] = await Promise.all([
      send('GET_GENERAL_SETTINGS'),
      send('GET_QUICK_ACTION_RECOMMENDATIONS'),
    ])
    const loadedSettings = settingsRes.payload as GeneralSettingsConfig
    setSettings(loadedSettings)
    setLastSavedQuickSettings(serializeQuickSettings(loadedSettings))
    const payload = recommendationRes.payload as QuickActionsPayload
    setRecommendations(Array.isArray(payload.actions) ? payload.actions : [])
  }, [])

  useEffect(() => { load() }, [load])

  async function saveSettings() {
    if (!settings) return
    await send('UPDATE_GENERAL_SETTINGS', {
      quickActions: settings.quickActions ?? [],
      showRecommendedQuickActions: settings.showRecommendedQuickActions ?? true,
    })
    setLastSavedQuickSettings(serializeQuickSettings(settings))
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  function updateActions(updater: (actions: QuickActionConfig[]) => QuickActionConfig[]) {
    if (!settings) return
    setSaved(false)
    setSettings({ ...settings, quickActions: updater(settings.quickActions ?? []) })
  }

  function updateAction(id: string, patch: Partial<QuickActionConfig>) {
    updateActions(actions => actions.map(action => action.id === id ? { ...action, ...patch } : action))
  }

  function addBlankAction() {
    updateActions(actions => [...actions, createQuickAction({ label: '新快捷按钮', prompt: '请描述这个快捷按钮要发送给助手的指令。' })])
  }

  function addRecommendation(action: QuickAction) {
    updateActions(actions => [...actions, fromRecommendation(action)])
  }

  function removeAction(id: string) {
    updateActions(actions => actions.filter(action => action.id !== id))
  }

  function toggleRecommendations(enabled: boolean) {
    if (!settings) return
    setSaved(false)
    setSettings({ ...settings, showRecommendedQuickActions: enabled })
  }

  const isDirty = useMemo(() => (
    settings !== null && serializeQuickSettings(settings) !== lastSavedQuickSettings
  ), [settings, lastSavedQuickSettings])

  if (!settings) return <div className="animate-pulse space-y-4"><div className="h-8 w-48 rounded bg-gray-200" /><div className="h-32 rounded bg-gray-200" /></div>

  const cardBg = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
  const inputBg = isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
  const actionButton = 'rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800'
  const primaryButton = 'rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700'
  const dangerButton = 'rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20'
  const configuredActions = settings.quickActions ?? []
  const configuredLabels = new Set(configuredActions.map(action => action.label.trim().toLowerCase()).filter(Boolean))
  const saveButton = `rounded-lg px-4 py-2 text-sm font-medium text-white ${isDirty ? 'bg-indigo-600 hover:bg-indigo-700' : 'cursor-not-allowed bg-indigo-400 opacity-60'}`

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Quick Actions</h2>
          <p className="mt-1 text-sm opacity-60">管理侧边栏输入框上方的快捷按钮。你可以手动定制，也可以把系统基于记忆、书签和历史推荐的按钮加入列表。</p>
          {isDirty && <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">Unsaved changes</p>}
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="rounded-full bg-green-100 px-3 py-1 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">Saved</span>}
          <button type="button" onClick={saveSettings} disabled={!isDirty} className={saveButton}>Save</button>
        </div>
      </div>

      <div className={`mb-6 rounded-xl border ${cardBg} p-5 shadow-sm`}>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            <span className="font-medium">Show system recommendations in side panel</span>
            <span className="mt-1 block text-xs opacity-60">开启后，侧边栏会在你的自定义按钮后补充系统推荐，最多显示 5 个。</span>
          </span>
          <input
            type="checkbox"
            checked={settings.showRecommendedQuickActions ?? true}
            onChange={e => toggleRecommendations(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
        </label>
      </div>

      <div className={`mb-6 rounded-xl border ${cardBg} p-5 shadow-sm`}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Your buttons</h3>
            <p className="mt-1 text-xs opacity-60">启用的按钮会优先出现在侧边栏。Label 是按钮文案，Prompt 是点击后填入输入框的指令。</p>
          </div>
          <button onClick={addBlankAction} className={primaryButton}>Add button</button>
        </div>

        {configuredActions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm opacity-60 dark:border-gray-700">还没有自定义快捷按钮。你可以新增一个，或从下方推荐中添加。</p>
        ) : (
          <div className="space-y-4">
            {configuredActions.map((action, index) => (
              <div key={action.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-xs font-medium uppercase tracking-wide opacity-50">Button {index + 1} · {action.source === 'recommended' ? 'recommended' : 'custom'}</div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={action.enabled} onChange={e => updateAction(action.id, { enabled: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
                      Enabled
                    </label>
                    <button onClick={() => removeAction(action.id)} className={dangerButton}>Delete</button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium opacity-70">Label</label>
                    <input
                      value={action.label}
                      onChange={e => updateAction(action.id, { label: e.target.value, source: action.source === 'recommended' ? 'recommended' : 'user' })}
                      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium opacity-70">Prompt</label>
                    <textarea
                      value={action.prompt}
                      onChange={e => updateAction(action.id, { prompt: e.target.value, source: action.source === 'recommended' ? 'recommended' : 'user' })}
                      rows={2}
                      className={`w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 ${inputBg}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`rounded-xl border ${cardBg} p-5 shadow-sm`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Recommended buttons</h3>
            <p className="mt-1 text-xs opacity-60">系统会根据用户记忆、知识、书签和最近历史抽取主题并生成按钮。</p>
          </div>
          <button onClick={load} className={actionButton}>Refresh</button>
        </div>

        {recommendations.length === 0 ? (
          <p className="text-sm opacity-60">暂时没有推荐。启用历史/书签记忆、保存更多记忆，或稍后刷新。</p>
        ) : (
          <div className="space-y-3">
            {recommendations.map(action => {
              const alreadyAdded = configuredLabels.has(action.label.trim().toLowerCase())
              return (
                <div key={`${action.label}-${action.prompt}`} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <div>
                    <div className="text-sm font-medium">{action.label}</div>
                    <div className="mt-1 text-xs leading-5 opacity-60">{action.prompt}</div>
                  </div>
                  <button disabled={alreadyAdded} onClick={() => addRecommendation(action)} className={alreadyAdded ? `${actionButton} cursor-not-allowed opacity-50` : primaryButton}>
                    {alreadyAdded ? 'Added' : 'Add'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
