// src/ui/ai/azureOpenAI.ts
import { tryRequest } from '../../providers/tryRequest'
import type { Result } from '../../providers/types'
import { bytesToBase64 } from './downscale'

export interface AzureOpenAiCallInput {
  apiKey: string
  endpoint: string
  systemPrompt: string
  userPrompt: string
  imageBytes: Uint8Array
}

const MAX_TOKENS = 2048

export async function callAzureOpenAI(
  input: AzureOpenAiCallInput,
): Promise<Result<string>> {
  return tryRequest<string>(
    () =>
      fetch(input.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'api-key': input.apiKey,
        },
        body: JSON.stringify({
          max_tokens: MAX_TOKENS,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: input.systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: input.userPrompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${bytesToBase64(input.imageBytes)}`,
                  },
                },
              ],
            },
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
