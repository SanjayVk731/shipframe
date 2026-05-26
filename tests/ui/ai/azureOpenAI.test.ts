import { afterEach, describe, expect, it, vi } from 'vitest'
import { callAzureOpenAI } from '../../../src/ui/ai/azureOpenAI'
import { installFetch, jsonResponse } from '../../helpers/fetchMock'

const endpoint =
  'https://mycorp.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('callAzureOpenAI vision payload', () => {
  it('includes an image_url data-URL element and the text element', async () => {
    const fetchFn = installFetch([
      {
        matches: (url) => url.includes('mycorp.openai.azure.com'),
        response: () =>
          jsonResponse(200, {
            choices: [{ message: { content: '{}' } }],
          }),
      },
    ])

    await callAzureOpenAI({
      apiKey: 'azkey',
      endpoint,
      systemPrompt: 'sys',
      userPrompt: 'usr',
      imageBytes: new Uint8Array([1, 2, 3]),
    })

    const body = JSON.parse(fetchFn.mock.calls[0]![1]!.body as string) as {
      messages: Array<{ role: string; content: unknown }>
    }
    const userMsg = body.messages.find((m) => m.role === 'user')!
    const content = userMsg.content as Array<Record<string, unknown>>
    expect(Array.isArray(content)).toBe(true)

    const image = content.find((c) => c.type === 'image_url') as
      | { type: string; image_url: { url: string } }
      | undefined
    expect(image).toBeTruthy()
    expect(image!.image_url.url.startsWith('data:image/png;base64,')).toBe(true)

    const text = content.find((c) => c.type === 'text') as
      | { type: string; text: string }
      | undefined
    expect(text).toEqual({ type: 'text', text: 'usr' })
  })
})
