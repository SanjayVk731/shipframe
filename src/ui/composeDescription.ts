export interface StructuredDescriptionInput {
  main: string
  reproSteps?: string
  expected?: string
  actual?: string
  acceptanceCriteria?: string
  outOfScope?: string
  /**
   * When provided, renders a prominent "Figma: <link>" paragraph at the top
   * of the description so devs scanning the ticket can't miss the design.
   * The label is typically the frame name.
   */
  figmaLink?: { url: string; label: string }
}

export interface ComposedDescription {
  /** HTML for the main Description field. Includes figma link, main body, expected/actual, out-of-scope. */
  description: string
  /** HTML for Microsoft.VSTS.Common.AcceptanceCriteria. Empty string when no AC provided. */
  acceptanceCriteriaHtml: string
  /** HTML for Microsoft.VSTS.TCM.ReproSteps. Empty string when no repro provided. */
  reproStepsHtml: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Strip a leading markdown-style list marker so "- A" / "* A" / "• A" / "1. A"
// / "2) A" all become "A". Users keep typing them; without this they leak into
// the rendered <li>.
const LIST_MARKER_RE = /^(?:[-*•]|\d+[.)])\s+/

function splitNonEmptyLines(s: string): string[] {
  return s
    .split('\n')
    .map((line) => line.trim().replace(LIST_MARKER_RE, '').trim())
    .filter((line) => line.length > 0)
}

function paragraph(text: string): string {
  return `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`
}

function paragraphSection(heading: string, body: string): string {
  const trimmed = body.trim()
  if (trimmed.length === 0) return ''
  return `<h2>${heading}</h2>${paragraph(trimmed)}`
}

function listHtml(body: string, ordered: boolean): string {
  const items = splitNonEmptyLines(body)
  if (items.length === 0) return ''
  const tag = ordered ? 'ol' : 'ul'
  const lis = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
  return `<${tag}>${lis}</${tag}>`
}

function figmaLinkParagraph(link: { url: string; label: string }): string {
  const href = escapeHtml(link.url)
  const label = escapeHtml(link.label)
  return `<p><strong>Figma:</strong> <a href="${href}">${label}</a></p>`
}

export function composeDescription(
  input: StructuredDescriptionInput,
): ComposedDescription {
  const descParts: string[] = []
  if (input.figmaLink) descParts.push(figmaLinkParagraph(input.figmaLink))
  const main = input.main.trim()
  if (main.length > 0) descParts.push(paragraph(main))
  descParts.push(paragraphSection('Expected behavior', input.expected ?? ''))
  descParts.push(paragraphSection('Actual behavior', input.actual ?? ''))
  descParts.push(paragraphSection('Out of scope', input.outOfScope ?? ''))

  return {
    description: descParts.filter((p) => p.length > 0).join(''),
    acceptanceCriteriaHtml: listHtml(input.acceptanceCriteria ?? '', false),
    reproStepsHtml: listHtml(input.reproSteps ?? '', true),
  }
}
