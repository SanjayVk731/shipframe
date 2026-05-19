import type { FileConfig, ProviderId } from '../shared/types'

const KEY = 'fileConfig'

function isFileConfig(v: unknown): v is FileConfig {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  const idOk = o.providerId === 'notion' || o.providerId === 'azure'
  return (
    idOk &&
    typeof o.boardId === 'string' &&
    typeof o.boardLabel === 'string'
  )
}

export function getFileConfig(): FileConfig | null {
  const raw = figma.root.getPluginData(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return isFileConfig(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function setFileConfig(config: FileConfig): void {
  figma.root.setPluginData(KEY, JSON.stringify(config))
}

export function clearFileConfig(): void {
  figma.root.setPluginData(KEY, '')
}

export type { ProviderId }
