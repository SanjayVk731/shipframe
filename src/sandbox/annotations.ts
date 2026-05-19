import type { ProviderId } from '../shared/types'

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
