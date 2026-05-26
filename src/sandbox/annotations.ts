import type { ProviderId } from '../shared/types'
import { truncateWithEllipsis } from '../shared/text'

interface AnnotationEntry {
  label?: string
  labelMarkdown?: string
}

// Matches both formats:
//   - Manual short labels: "AZURE-123" or "Notion · title · #abc12345"
//   - AI-Draft suffix on the last line: "...\n— AZURE-123" or "...\n— Notion #abc12345"
// Single source of truth for pin ownership. See spec.
const OURS_TAIL_RE =
  /(?:^|\n)(?:— )?(?:AZURE-\d+|Notion (?:· .+ · )?#[0-9a-f]{8})$/

export function isOursTail(label: string): boolean {
  return OURS_TAIL_RE.test(label)
}

// PluginData key marking a frame that currently holds an un-published AI draft
// pin. selection.ts imports this to populate SelectionState.hasDraftPin.
export const DRAFT_PIN_KEY = 'aiDraftPin'

const MAX_TITLE_LEN = 60

export interface BuildLabelInput {
  providerId: ProviderId
  ticketId: string
  title: string
}

// Last 8 hex chars of a Notion ticket id, dash-stripped and zero-padded.
// Single source for the short-id used in both the full label and the suffix.
function notionShortId(ticketId: string): string {
  return ticketId.replace(/-/g, '').toLowerCase().slice(-8).padStart(8, '0')
}

export function buildLabel(input: BuildLabelInput): string {
  if (input.providerId === 'azure') {
    return `AZURE-${input.ticketId}`
  }
  const safeTitle = truncateWithEllipsis(input.title, MAX_TITLE_LEN)
  return `Notion · ${safeTitle} · #${notionShortId(input.ticketId)}`
}

function shortSuffix(providerId: ProviderId, ticketId: string): string {
  if (providerId === 'azure') return `AZURE-${ticketId}`
  return `Notion #${notionShortId(ticketId)}`
}

export type SyncReason = 'node-missing' | 'api-unavailable' | 'unsupported-node'
export type SyncResult = { ok: true } | { ok: false; reason: SyncReason }

function annotationsApiAvailable(): boolean {
  return typeof (figma as unknown as { annotations?: unknown }).annotations !== 'undefined'
}

function supportsAnnotations(
  node: SceneNode,
): node is SceneNode & { annotations: AnnotationEntry[] } {
  return 'annotations' in node && Array.isArray((node as { annotations?: unknown }).annotations)
}

async function findSupported(nodeId: string): Promise<
  | { ok: true; node: SceneNode & { annotations: AnnotationEntry[] } }
  | { ok: false; reason: SyncReason }
> {
  if (!annotationsApiAvailable()) return { ok: false, reason: 'api-unavailable' }
  const node = (await figma.getNodeByIdAsync(nodeId)) as SceneNode | null
  if (!node) return { ok: false, reason: 'node-missing' }
  if (!supportsAnnotations(node)) return { ok: false, reason: 'unsupported-node' }
  return { ok: true, node }
}

function isOursEntry(node: SceneNode, entry: AnnotationEntry): boolean {
  if (entry.labelMarkdown && isOursTail(entry.labelMarkdown)) return true
  if (entry.label && isOursTail(entry.label)) return true
  if (node.getPluginData(DRAFT_PIN_KEY) === '1' && entry.labelMarkdown) return true
  return false
}

export async function clearAnnotation(nodeId: string): Promise<SyncResult> {
  const r = await findSupported(nodeId)
  if (!r.ok) return r
  r.node.annotations = (r.node.annotations ?? []).filter((a) => !isOursEntry(r.node, a))
  return { ok: true }
}

// Manual-create path. Idempotent — does NOT clobber an existing ours-pin that
// already carries a valid suffix or AI body. Only writes when there is no
// ours-pin at all (self-heal after the designer deleted it).
export async function syncAnnotation(
  nodeId: string,
  input: BuildLabelInput,
): Promise<SyncResult> {
  const r = await findSupported(nodeId)
  if (!r.ok) return r
  const target = buildLabel(input)
  const current = r.node.annotations ?? []
  const ours = current.filter((a) => isOursEntry(r.node, a))
  if (ours.length === 1) return { ok: true }
  const manual = current.filter((a) => !isOursEntry(r.node, a))
  r.node.annotations = [...manual, { label: target }]
  return { ok: true }
}

export async function writeAiAnnotation(
  nodeId: string,
  markdown: string,
): Promise<SyncResult> {
  const r = await findSupported(nodeId)
  if (!r.ok) return r
  const current = r.node.annotations ?? []
  const manual = current.filter((a) => !isOursEntry(r.node, a))
  r.node.annotations = [...manual, { labelMarkdown: markdown }]
  r.node.setPluginData(DRAFT_PIN_KEY, '1')
  return { ok: true }
}

// Append "— <suffix>" to the existing pin body, but idempotently: if the body
// already ends with this exact suffix (e.g. a re-publish or retry calls this
// twice), return it unchanged rather than producing "…— AZURE-42\n— AZURE-42".
export function appendSuffix(existingBody: string | undefined, suffix: string): string {
  if (!existingBody || existingBody.length === 0) return suffix
  if (existingBody === suffix || existingBody.endsWith(`— ${suffix}`)) {
    return existingBody
  }
  return `${existingBody}\n— ${suffix}`
}

export async function appendTicketIdToAnnotation(
  nodeId: string,
  providerId: ProviderId,
  ticketId: string,
): Promise<SyncResult> {
  const r = await findSupported(nodeId)
  if (!r.ok) return r
  const suffix = shortSuffix(providerId, ticketId)
  const current = r.node.annotations ?? []
  const manual = current.filter((a) => !isOursEntry(r.node, a))
  const ours = current.find((a) => isOursEntry(r.node, a))
  const existingBody = ours?.labelMarkdown ?? ours?.label
  const nextMarkdown = appendSuffix(existingBody, suffix)
  r.node.annotations = [...manual, { labelMarkdown: nextMarkdown }]
  r.node.setPluginData(DRAFT_PIN_KEY, '')
  return { ok: true }
}

export async function clearAiAnnotation(nodeId: string): Promise<SyncResult> {
  const r = await clearAnnotation(nodeId)
  if (!r.ok) return r
  const node = (await figma.getNodeByIdAsync(nodeId)) as SceneNode | null
  if (node) node.setPluginData(DRAFT_PIN_KEY, '')
  return { ok: true }
}
