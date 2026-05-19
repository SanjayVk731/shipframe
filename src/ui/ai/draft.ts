import type { FrameContext } from '../../shared/types'
import type { Result } from '../../providers/types'
import type { AiConfig } from '../../storage/aiConfig'
import { buildSystemPrompt, buildUserPrompt } from './prompt'
import { parseDraftResponse } from './parseResponse'
import { callAnthropic } from './anthropic'
import { callOpenAI } from './openai'
import type { DraftOutput } from './types'

async function callOnce(
  ai: AiConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<Result<string>> {
  if (ai.provider === 'anthropic') {
    return callAnthropic({ apiKey: ai.key, systemPrompt, userPrompt })
  }
  return callOpenAI({ apiKey: ai.key, systemPrompt, userPrompt })
}

export async function draftFromContext(
  ctx: FrameContext,
  ai: AiConfig,
): Promise<Result<DraftOutput>> {
  const system = buildSystemPrompt()
  const user = buildUserPrompt(ctx)

  const first = await callOnce(ai, system, user)
  if (!first.ok) return first

  const parsed = parseDraftResponse(first.value, ctx.workItemType)
  if (parsed.ok) return { ok: true, value: parsed.value, status: first.status }

  // Retry once with a stricter reminder.
  const stricter =
    user + '\n\nReturn ONLY a valid JSON object. No prose, no markdown fences.'
  const second = await callOnce(ai, system, stricter)
  if (!second.ok) return second

  const parsed2 = parseDraftResponse(second.value, ctx.workItemType)
  if (parsed2.ok) return { ok: true, value: parsed2.value, status: second.status }

  return { ok: false, reason: 'unknown', status: second.status }
}
