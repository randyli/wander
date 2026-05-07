import { createStorage } from './base'
import type { BaseStorage } from './base'

export interface GeneralSettingsConfig {
  defaultProvider: string
  defaultModel: string
  maxToolCallsPerTask: number
  maxEpisodes: number
}

export type GeneralSettingsStorage = BaseStorage<GeneralSettingsConfig> & {
  updateSettings: (settings: Partial<GeneralSettingsConfig>) => Promise<void>
  getSettings: () => Promise<GeneralSettingsConfig>
  resetToDefaults: () => Promise<void>
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettingsConfig = {
  defaultProvider: 'claude',
  defaultModel: 'claude-opus-4-7',
  maxToolCallsPerTask: 20,
  maxEpisodes: 100,
}

const storage = createStorage<GeneralSettingsConfig>(
  'wander_general_settings',
  DEFAULT_GENERAL_SETTINGS,
  { liveUpdate: true },
)

export const generalSettingsStore: GeneralSettingsStorage = {
  ...storage,
  async updateSettings(settings: Partial<GeneralSettingsConfig>) {
    const current = await storage.get()
    await storage.set({ ...current, ...settings })
  },
  async getSettings() {
    const settings = await storage.get()
    return { ...DEFAULT_GENERAL_SETTINGS, ...settings }
  },
  async resetToDefaults() {
    await storage.set(DEFAULT_GENERAL_SETTINGS)
  },
}
