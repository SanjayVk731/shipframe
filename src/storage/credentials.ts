import type { ProviderId } from '../shared/types'

function key(id: ProviderId): string {
  return `pat:${id}`
}

export async function getPat(id: ProviderId): Promise<string | null> {
  const v = await figma.clientStorage.getAsync(key(id))
  return typeof v === 'string' && v.length > 0 ? v : null
}

export async function setPat(id: ProviderId, value: string): Promise<void> {
  await figma.clientStorage.setAsync(key(id), value)
}

export async function clearPat(id: ProviderId): Promise<void> {
  await figma.clientStorage.deleteAsync(key(id))
}
