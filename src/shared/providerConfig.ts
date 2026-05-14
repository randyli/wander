import type { GeneralSettingsConfig, ProviderConfig } from './types'

export type MissingProviderConfigReason =
  | 'PROVIDER_NOT_FOUND'
  | 'API_KEY_MISSING'
  | 'MODEL_NOT_AVAILABLE'

export interface MissingProviderConfigError {
  code: 'MISSING_PROVIDER_CONFIG'
  provider: string
  model: string
  reason: MissingProviderConfigReason
  message: string
}

export function validateSelectedProviderConfig(
  settings: GeneralSettingsConfig,
  providers: Record<string, ProviderConfig>,
): MissingProviderConfigError | null {
  const providerId = settings.provider
  const model = settings.model
  const provider = providers[providerId]

  if (!provider) {
    return {
      code: 'MISSING_PROVIDER_CONFIG',
      provider: providerId,
      model,
      reason: 'PROVIDER_NOT_FOUND',
      message: `Provider ${providerId} is not configured.`,
    }
  }

  if (!provider.apiKey.trim()) {
    return {
      code: 'MISSING_PROVIDER_CONFIG',
      provider: providerId,
      model,
      reason: 'API_KEY_MISSING',
      message: `Provider ${providerId} is missing an API key.`,
    }
  }

  if (!provider.modelNames.includes(model)) {
    return {
      code: 'MISSING_PROVIDER_CONFIG',
      provider: providerId,
      model,
      reason: 'MODEL_NOT_AVAILABLE',
      message: `Model ${model} is not available for provider ${providerId}.`,
    }
  }

  return null
}
