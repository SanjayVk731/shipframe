import type { FrameContext } from '../../shared/types'
import type { Result } from '../../providers/types'
import type { AiConfig } from '../../storage/aiConfig'
import { buildSystemPrompt, buildUserPrompt } from './prompt'
import { parseDraftResponse } from './parseResponse'
import { callAnthropic } from './anthropic'
import { callOpenAI } from './openai'
import { callAzureOpenAI } from './azureOpenAI'
import { downscaleForVision } from './downscale'
import { PIN_MARKDOWN_MAX, type DraftOutput } from './types'

async function callOnce(
  ai: AiConfig,
  systemPrompt: string,
  userPrompt: string,
  imageBytes: Uint8Array,
): Promise<Result<string>> {
  if (ai.provider === 'anthropic') {
    return callAnthropic({ apiKey: ai.key, systemPrompt, userPrompt, imageBytes })
  }
  if (ai.provider === 'azure-openai') {
    if (!ai.endpoint) return { ok: false, reason: 'auth_failed', status: 0 }
    return callAzureOpenAI({
      apiKey: ai.key,
      endpoint: ai.endpoint,
      systemPrompt,
      userPrompt,
      imageBytes,
    })
  }
  return callOpenAI({ apiKey: ai.key, systemPrompt, userPrompt, imageBytes })
}

function synthesizePin(value: DraftOutput): string | undefined {
  const title = value.title?.trim() ?? ''
  const main = value.main?.trim() ?? ''
  const firstLine = main.split('\n')[0] ?? ''
  const combined = [title, firstLine].filter((s) => s.length > 0).join('\n')
  if (combined.length === 0) return undefined
  return combined.length <= PIN_MARKDOWN_MAX
    ? combined
    : combined.slice(0, PIN_MARKDOWN_MAX - 1) + '…'
}

export async function draftFromContext(
  ctx: FrameContext,
  ai: AiConfig,
  imageBytes: Uint8Array,
): Promise<Result<DraftOutput>> {
  const downscaled = await downscaleForVision(imageBytes)
  const system = buildSystemPrompt()
  const user = buildUserPrompt(ctx)

  const first = await callOnce(ai, system, user, downscaled)
  if (!first.ok) return first

  const parsed = parseDraftResponse(first.value, ctx.workItemType)
  if (parsed.ok) {
    const v = parsed.value
    if (!v.pinMarkdown) v.pinMarkdown = synthesizePin(v)
    return { ok: true, value: v, status: first.status }
  }

  // Retry once with a stricter reminder.
  const stricter =
    user + '\n\nReturn ONLY a valid JSON object. No prose, no markdown fences.'
  const second = await callOnce(ai, system, stricter, downscaled)
  if (!second.ok) return second

  const parsed2 = parseDraftResponse(second.value, ctx.workItemType)
  if (parsed2.ok) {
    const v = parsed2.value
    if (!v.pinMarkdown) v.pinMarkdown = synthesizePin(v)
    return { ok: true, value: v, status: second.status }
  }

  return { ok: false, reason: 'unknown', status: second.status }
}
