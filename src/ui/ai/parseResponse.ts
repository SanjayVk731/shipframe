import { DRAFT_KEYS, type DraftOutput } from './types'

export type ParseResult =
  | { ok: true; value: DraftOutput }
  | { ok: false; reason: 'malformed' }

function keysFor(wit: string | undefined): Array<keyof DraftOutput> {
  const w = wit ?? 'User Story'
  switch (w) {
    case 'Bug':
      return ['title', 'main', 'reproSteps', 'expected', 'actual']
    case 'Task':
    case 'Epic':
      return ['title', 'main', 'acceptanceCriteria']
    case 'User Story':
    case 'Feature':
      return ['title', 'main', 'acceptanceCriteria', 'outOfScope']
    default:
      return ['title', 'main', 'acceptanceCriteria', 'outOfScope']
  }
}

function stripFences(raw: string): string {
  const trimmed = raw.trim()
  const m = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return m && m[1] !== undefined ? m[1] : trimmed
}

function coerce(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

export function parseDraftResponse(
  raw: string,
  wit: string | undefined,
): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripFences(raw))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'malformed' }
  }
  const allowed = new Set<keyof DraftOutput>(keysFor(wit))
  const value: DraftOutput = {}
  for (const key of DRAFT_KEYS) {
    if (!allowed.has(key)) continue
    const rawValue = (parsed as Record<string, unknown>)[key]
    if (rawValue === undefined) continue
    const s = coerce(rawValue)
    if (s !== undefined) value[key] = s
  }
  return { ok: true, value }
}
