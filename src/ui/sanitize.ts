import DOMPurify from 'isomorphic-dompurify'

// Two-tier sanitization. Both tiers share a conservative tag whitelist and
// forbid script/style/iframe + all event-handler attributes (only href/src/alt
// are allowed, so onerror/onload/etc. are stripped). They differ on <img>:
//
// - PROSE tier (user-typed or AI-drafted markdown): <img> is NOT allowed.
//   An attacker-controlled image URL written into a ticket description becomes
//   a tracking beacon / SSRF-on-viewer primitive when a teammate opens the
//   ticket in their browser. Users are not expected to embed images in prose,
//   so we strip them entirely.
// - TRUSTED tier (sanitizeHtml): <img> IS allowed. The only caller is the Azure
//   provider embedding a frame screenshot it just uploaded; the src points at
//   the provider's own attachment store, not an arbitrary external host. This
//   pass is defense-in-depth over already-trusted input.
const BASE_TAGS = [
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
]
const PROSE_TAGS = BASE_TAGS
const TRUSTED_TAGS = [...BASE_TAGS, 'img']
const ALLOWED_ATTR = ['href', 'src', 'alt']
const FORBID_TAGS = ['script', 'style', 'iframe']

/** Sanitize user-typed/AI-drafted prose. Strips <img> (see module comment). */
export function sanitizeProse(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: PROSE_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS,
  })
}

/**
 * Sanitize HTML that already contains a trusted, provider-built `<img>` (e.g.
 * Azure prepending an `<img>` from an upload URL). Allows <img>; otherwise the
 * same conservative allow-list as prose — strips event handlers / javascript:
 * URLs even though the input is already trusted.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: TRUSTED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS,
  })
}
