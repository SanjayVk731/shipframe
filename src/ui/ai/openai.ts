// src/ui/ai/openai.ts
import { tryRequest } from '../../providers/tryRequest'
import type { Result } from '../../providers/types'

export interface OpenAiCallInput {
  apiKey: string
  systemPrompt: string
  userPrompt: string
}

const URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'
const MAX_TOKENS = 2048

export async function callOpenAI(
  input: OpenAiCallInput,
): Promise<Result<string>> {
  return tryRequest<string>(
    () =>
      fetch(URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userPrompt },
          ],
        }),
      }),
    async (res) => {
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const text = body.choices?.[0]?.message?.content
      if (typeof text !== 'string') throw new Error('no_text_block')
      return text
    },
  )
}
