export type AiProvider = 'anthropic' | 'openai' | 'azure-openai'

export interface AiConfig {
  provider: AiProvider
  key: string
  endpoint?: string
}

const PROVIDER_KEY = 'ai:provider'
const KEY_KEY = 'ai:key'
const ENDPOINT_KEY = 'ai:endpoint'

function isAiProvider(v: unknown): v is AiProvider {
  return v === 'anthropic' || v === 'openai' || v === 'azure-openai'
}

function isAzureOpenAiEndpoint(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0) return false
  try {
    const url = new URL(v)
    if (url.protocol !== 'https:') return false
    return url.hostname.endsWith('.openai.azure.com')
  } catch {
    return false
  }
}

export async function getAiConfig(): Promise<AiConfig | undefined> {
  const provider = await figma.clientStorage.getAsync(PROVIDER_KEY)
  const key = await figma.clientStorage.getAsync(KEY_KEY)
  if (!isAiProvider(provider)) return undefined
  if (typeof key !== 'string' || key.length === 0) return undefined
  if (provider === 'azure-openai') {
    const endpoint = await figma.clientStorage.getAsync(ENDPOINT_KEY)
    if (!isAzureOpenAiEndpoint(endpoint)) return undefined
    return { provider, key, endpoint }
  }
  return { provider, key }
}

export async function setAiConfig(cfg: AiConfig): Promise<void> {
  await figma.clientStorage.setAsync(PROVIDER_KEY, cfg.provider)
  await figma.clientStorage.setAsync(KEY_KEY, cfg.key)
  if (cfg.provider === 'azure-openai' && cfg.endpoint) {
    await figma.clientStorage.setAsync(ENDPOINT_KEY, cfg.endpoint)
  } else {
    await figma.clientStorage.deleteAsync(ENDPOINT_KEY)
  }
}

export async function clearAiConfig(): Promise<void> {
  await figma.clientStorage.deleteAsync(PROVIDER_KEY)
  await figma.clientStorage.deleteAsync(KEY_KEY)
  await figma.clientStorage.deleteAsync(ENDPOINT_KEY)
  // Defensive: an earlier short-lived build wrote ai:model for an Ollama provider
  // that never shipped. Clean it up so it doesn't linger forever.
  await figma.clientStorage.deleteAsync('ai:model')
}
