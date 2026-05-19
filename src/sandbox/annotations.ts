import type { ProviderId } from '../shared/types'

interface AnnotationEntry {
  label: string
  categoryId: string
}

const AZURE_LABEL_RE = /^AZURE-\d+$/
const NOTION_LABEL_RE = /^Notion · .+ · #[0-9a-f]{8}$/

export function isOursLabel(label: string): boolean {
  return AZURE_LABEL_RE.test(label) || NOTION_LABEL_RE.test(label)
}

const MAX_TITLE_LEN = 60

export interface BuildLabelInput {
  providerId: ProviderId
  ticketId: string
  title: string
}

export function buildLabel(input: BuildLabelInput): string {
  if (input.providerId === 'azure') {
    return `AZURE-${input.ticketId}`
  }
  // Notion: derive 8-char short id from end of the UUID/page-id, lowercase hex
  const cleaned = input.ticketId.replace(/-/g, '').toLowerCase()
  const shortId = cleaned.slice(-8).padStart(8, '0')
  const safeTitle =
    input.title.length > MAX_TITLE_LEN
      ? input.title.slice(0, MAX_TITLE_LEN - 1) + '…'
      : input.title
  return `Notion · ${safeTitle} · #${shortId}`
}

export type SyncReason = 'node-missing' | 'api-unavailable'

export type SyncResult = { ok: true } | { ok: false; reason: SyncReason }

function categoryForProvider(providerId: ProviderId): string {
  // Stable per-provider categoryId. Real categories are created by the user
  // in Figma; we just use a deterministic string so all our pins of a kind
  // share grouping if categories exist.
  return providerId === 'azure' ? 'azure' : 'notion'
}

export async function clearAnnotation(nodeId: string): Promise<SyncResult> {
  if (typeof (figma as unknown as { annotations?: unknown }).annotations === 'undefined') {
    return { ok: false, reason: 'api-unavailable' }
  }
  const node = (await figma.getNodeByIdAsync(nodeId)) as
    | (SceneNode & { annotations: AnnotationEntry[] })
    | null
  if (!node) return { ok: false, reason: 'node-missing' }
  node.annotations = (node.annotations ?? []).filter((a) => !isOursLabel(a.label))
  return { ok: true }
}

export async function syncAnnotation(
  nodeId: string,
  input: BuildLabelInput,
): Promise<SyncResult> {
  if (typeof (figma as unknown as { annotations?: unknown }).annotations === 'undefined') {
    return { ok: false, reason: 'api-unavailable' }
  }
  const node = (await figma.getNodeByIdAsync(nodeId)) as
    | (SceneNode & { annotations: AnnotationEntry[] })
    | null
  if (!node) return { ok: false, reason: 'node-missing' }

  const target = buildLabel(input)
  const targetCategory = categoryForProvider(input.providerId)
  const current: AnnotationEntry[] = node.annotations ?? []

  const manual = current.filter((a) => !isOursLabel(a.label))
  const oursTargetMatches = current.filter((a) => a.label === target)

  if (oursTargetMatches.length === 1 && manual.length + 1 === current.length) {
    // Exactly one match, no extra ours-pins → noop.
    return { ok: true }
  }

  node.annotations = [...manual, { label: target, categoryId: targetCategory }]
  return { ok: true }
}
