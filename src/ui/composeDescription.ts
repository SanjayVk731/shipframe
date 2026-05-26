import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'

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

// Markdown processing:
// - breaks: true → single newlines become <br>, matching textarea expectations.
// - gfm: true   → GFM extras (autolinks, strikethrough) at low cost.
// - The library no longer mangles emails or runs a built-in sanitizer.
// We rely on DOMPurify (below) as the sole defense against XSS / image embeds.
marked.setOptions({ gfm: true, breaks: true })

// Sanitizer config — common to all callers. We allow <img> (with only src/alt)
// so providers can embed uploaded frame screenshots into the description; the
// upload URL points at the provider's own attachment store, not an arbitrary
// external host. Event-handler attributes (onerror/onload/etc.) are not in
// ALLOWED_ATTR, so DOMPurify strips them; script/style/iframe remain forbidden.
// We allow only a conservative tag set; everything else is stripped.
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'code',
  'pre',
  'a',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'blockquote',
  'img',
]
const ALLOWED_ATTR = ['href', 'src', 'alt']

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['script', 'style', 'iframe'],
  })
}

/**
 * Render a multi-line user-input string as a block of markdown → HTML, then
 * sanitize. Trailing whitespace from marked is trimmed for stable composition.
 */
function renderMarkdownBlock(s: string): string {
  const trimmed = s.trim()
  if (trimmed.length === 0) return ''
  const html = marked.parse(trimmed) as string
  return sanitize(html.trim())
}

/**
 * Render a single line as inline markdown (no <p> wrapper), then sanitize.
 * Used inside <li> items where we control the wrapping.
 */
function renderMarkdownInline(s: string): string {
  const trimmed = s.trim()
  if (trimmed.length === 0) return ''
  const html = marked.parseInline(trimmed) as string
  return sanitize(html.trim())
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

function listHtml(body: string, ordered: boolean): string {
  const items = splitNonEmptyLines(body)
  if (items.length === 0) return ''
  const tag = ordered ? 'ol' : 'ul'
  const lis = items.map((item) => `<li>${renderMarkdownInline(item)}</li>`).join('')
  return `<${tag}>${lis}</${tag}>`
}

function paragraphSection(heading: string, body: string): string {
  const rendered = renderMarkdownBlock(body)
  if (rendered.length === 0) return ''
  return `<h2>${heading}</h2>${rendered}`
}

function figmaLinkParagraph(link: { url: string; label: string }): string {
  // Render via DOMPurify to neutralize javascript: URLs even though label/url
  // come from our own code today — the trust boundary stays consistent.
  const html = `<p><strong>Figma:</strong> <a href="${link.url}">${escapeForAttr(
    link.label,
  )}</a></p>`
  return sanitize(html)
}

// Minimal escape for embedding the frame name as link text (not an attribute).
// Anything dangerous gets caught by DOMPurify below anyway.
function escapeForAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function composeDescription(
  input: StructuredDescriptionInput,
): ComposedDescription {
  const descParts: string[] = []
  if (input.figmaLink) descParts.push(figmaLinkParagraph(input.figmaLink))
  const mainHtml = renderMarkdownBlock(input.main)
  if (mainHtml.length > 0) descParts.push(mainHtml)
  descParts.push(paragraphSection('Expected behavior', input.expected ?? ''))
  descParts.push(paragraphSection('Actual behavior', input.actual ?? ''))
  descParts.push(paragraphSection('Out of scope', input.outOfScope ?? ''))

  return {
    description: descParts.filter((p) => p.length > 0).join(''),
    acceptanceCriteriaHtml: listHtml(input.acceptanceCriteria ?? '', false),
    reproStepsHtml: listHtml(input.reproSteps ?? '', true),
  }
}
