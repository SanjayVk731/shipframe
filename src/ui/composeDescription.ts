export interface StructuredDescriptionInput {
  main: string
  reproSteps?: string
  expected?: string
  actual?: string
  acceptanceCriteria?: string
  outOfScope?: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function splitNonEmptyLines(s: string): string[] {
  return s
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function paragraph(text: string): string {
  // Preserve user line breaks as <br>. Trailing/leading whitespace already trimmed by caller.
  return `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`
}

function listSection(heading: string, body: string, ordered: boolean): string {
  const items = splitNonEmptyLines(body)
  if (items.length === 0) return ''
  const tag = ordered ? 'ol' : 'ul'
  const lis = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
  return `<h2>${heading}</h2><${tag}>${lis}</${tag}>`
}

function paragraphSection(heading: string, body: string): string {
  const trimmed = body.trim()
  if (trimmed.length === 0) return ''
  return `<h2>${heading}</h2>${paragraph(trimmed)}`
}

export function composeDescription(input: StructuredDescriptionInput): string {
  const parts: string[] = []
  const main = input.main.trim()
  if (main.length > 0) parts.push(paragraph(main))
  parts.push(listSection('Reproduction steps', input.reproSteps ?? '', true))
  parts.push(paragraphSection('Expected behavior', input.expected ?? ''))
  parts.push(paragraphSection('Actual behavior', input.actual ?? ''))
  parts.push(listSection('Acceptance criteria', input.acceptanceCriteria ?? '', false))
  parts.push(paragraphSection('Out of scope', input.outOfScope ?? ''))
  return parts.filter((p) => p.length > 0).join('')
}
