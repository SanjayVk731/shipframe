const AZURE_LABEL_RE = /^AZURE-\d+$/
const NOTION_LABEL_RE = /^Notion · .+ · #[0-9a-f]{8}$/

export function isOursLabel(label: string): boolean {
  return AZURE_LABEL_RE.test(label) || NOTION_LABEL_RE.test(label)
}
