import type { FrameContext } from '../../shared/types'
import { DRAFT_KEYS } from './types'

export function buildSystemPrompt(): string {
  return [
    'You draft software tickets from a Figma frame.',
    'Return ONLY a JSON object — no prose, no markdown fences.',
    `Allowed keys (omit any that do not apply): ${DRAFT_KEYS.join(', ')}.`,
    'Each value is plain text (markdown allowed for "main"). Lists in',
    '"reproSteps", "acceptanceCriteria", "outOfScope" should be newline-separated;',
    'do not include leading bullet markers — the caller adds them.',
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
    'Visible text layers (screen copy):',
    textLayers,
    '',
    'Draft a ticket as JSON.',
  ].join('\n')
}
