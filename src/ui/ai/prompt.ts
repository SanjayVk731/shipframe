import type { FrameContext } from '../../shared/types'
import { DRAFT_KEYS } from './types'

export function buildSystemPrompt(): string {
  return [
    'You draft software tickets from a Figma frame.',
    'You will receive a screenshot of the frame. Use it as the primary signal for what is on screen; the text-layer list is incomplete (icons, vectors, and rasterized text will not appear there).',
    'Return ONLY a JSON object — no prose, no markdown fences.',
    `Allowed keys (omit any that do not apply): ${DRAFT_KEYS.join(', ')}.`,
    'Each value is plain text (markdown allowed for "main"). Lists in',
    '"reproSteps", "acceptanceCriteria", "outOfScope" should be newline-separated;',
    'do not include leading bullet markers — the caller adds them.',
    '"pinMarkdown" is a 1–3 line markdown summary placed as a Figma annotation visible on the canvas. Keep it under 280 characters.',
  ].join('\n')
}

export function buildUserPrompt(ctx: FrameContext): string {
  const wit = ctx.workItemType ?? 'User Story'
  const annotations = ctx.annotations.length
    ? ctx.annotations.map((a) => ` • ${a}`).join('\n')
    : ' (none)'
  const textLayers = ctx.textLayers.length
    ? ctx.textLayers.map((t) => ` • ${t}`).join('\n')
    : ' (none)'
  return [
    `Frame: "${ctx.frameName}"`,
    `Work item type: ${wit}`,
    '',
    'Native Figma annotations on the frame (designer\'s own words — strongest signal):',
    annotations,
    '',
    'Visible text layers from the layer tree (partial — cross-reference against the screenshot):',
    textLayers,
    '',
    'Draft a ticket as JSON.',
  ].join('\n')
}
