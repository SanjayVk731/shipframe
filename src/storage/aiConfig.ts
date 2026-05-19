export type AiProvider = 'anthropic' | 'openai'

export interface AiConfig {
  provider: AiProvider
  key: string
}

const PROVIDER_KEY = 'ai:provider'
const KEY_KEY = 'ai:key'

function isAiProvider(v: unknown): v is AiProvider {
  return v === 'anthropic' || v === 'openai'
}

export async function getAiConfig(): Promise<AiConfig | undefined> {
  const provider = await figma.clientStorage.getAsync(PROVIDER_KEY)
  const key = await figma.clientStorage.getAsync(KEY_KEY)
  if (!isAiProvider(provider)) return undefined
  if (typeof key !== 'string' || key.length === 0) return undefined
  return { provider, key }
}

export async function setAiConfig(cfg: AiConfig): Promise<void> {
  await figma.clientStorage.setAsync(PROVIDER_KEY, cfg.provider)
  await figma.clientStorage.setAsync(KEY_KEY, cfg.key)
}

export async function clearAiConfig(): Promise<void> {
  await figma.clientStorage.deleteAsync(PROVIDER_KEY)
  await figma.clientStorage.deleteAsync(KEY_KEY)
}
