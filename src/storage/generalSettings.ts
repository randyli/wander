import { createStorage } from './base'
import type { BaseStorage } from './base'

export interface GeneralSettingsConfig {
  provider: string
  model: string
  maxToolCallsPerTask: number
  maxEpisodes: number
  enableHistoryMemory: boolean
  enableBookmarkMemory: boolean
  memoryRetentionDays: number
}

type LegacyGeneralSettingsConfig = Partial<GeneralSettingsConfig> & {
  defaultProvider?: string
  defaultModel?: string
}

export type GeneralSettingsStorage = BaseStorage<GeneralSettingsConfig> & {
  updateSettings: (settings: Partial<GeneralSettingsConfig>) => Promise<void>
  getSettings: () => Promise<GeneralSettingsConfig>
  resetToDefaults: () => Promise<void>
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettingsConfig = {
  provider: 'claude',
  model: 'claude-opus-4-7',
  maxToolCallsPerTask: 20,
  maxEpisodes: 100,
  enableHistoryMemory: true,
  enableBookmarkMemory: true,
  memoryRetentionDays: 30,
}

const storage = createStorage<GeneralSettingsConfig>(
  'wander_general_settings',
  DEFAULT_GENERAL_SETTINGS,
  { liveUpdate: true },
)

function normalizeSettings(settings: LegacyGeneralSettingsConfig): GeneralSettingsConfig {
  return {
    ...DEFAULT_GENERAL_SETTINGS,
    ...settings,
    provider: settings.provider ?? settings.defaultProvider ?? DEFAULT_GENERAL_SETTINGS.provider,
    model: settings.model ?? settings.defaultModel ?? DEFAULT_GENERAL_SETTINGS.model,
  }
}

export const generalSettingsStore: GeneralSettingsStorage = {
  ...storage,
  async updateSettings(settings: Partial<GeneralSettingsConfig>) {
    const current = normalizeSettings(await storage.get())
    await storage.set({ ...current, ...settings })
  },
  async getSettings() {
    const settings = await storage.get() as LegacyGeneralSettingsConfig
    return normalizeSettings(settings)
  },
  async resetToDefaults() {
    await storage.set(DEFAULT_GENERAL_SETTINGS)
  },
}
