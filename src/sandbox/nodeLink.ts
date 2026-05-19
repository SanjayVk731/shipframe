import type { TicketLink } from '../shared/types'

const KEY = 'ticketLink'

function isLink(v: unknown): v is TicketLink {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.url === 'string' &&
    (o.providerId === 'notion' || o.providerId === 'azure') &&
    typeof o.createdAt === 'string'
  )
}

export function readLink(node: SceneNode): TicketLink | null {
  const raw = node.getPluginData(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return isLink(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeLink(node: SceneNode, link: TicketLink): void {
  node.setPluginData(KEY, JSON.stringify(link))
}

export function clearLink(node: SceneNode): void {
  node.setPluginData(KEY, '')
}
