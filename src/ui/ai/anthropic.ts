// src/ui/ai/anthropic.ts
import { tryRequest } from '../../providers/tryRequest'
import type { Result } from '../../providers/types'

export interface AnthropicCallInput {
  apiKey: string
  systemPrompt: string
  userPrompt: string
}

const URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 2048

export async function callAnthropic(
  input: AnthropicCallInput,
): Promise<Result<string>> {
  return tryRequest<string>(
    () =>
      fetch(URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': input.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: input.systemPrompt,
          messages: [{ role: 'user', content: input.userPrompt }],
        }),
      }),
    async (res) => {
      const body = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>
      }
      const text = body.content?.find((c) => c.type === 'text')?.text
      if (typeof text !== 'string') throw new Error('no_text_block')
      return text
    },
  )
}
