import { afterEach, describe, expect, it, vi } from 'vitest'
import { callAnthropic } from '../../../src/ui/ai/anthropic'
import { installFetch, jsonResponse } from '../../helpers/fetchMock'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('callAnthropic vision payload', () => {
  it('puts an image block first and the text block second in the user message', async () => {
    const fetchFn = installFetch([
      {
        matches: (url) => url.includes('api.anthropic.com'),
        response: () =>
          jsonResponse(200, { content: [{ type: 'text', text: '{}' }] }),
      },
    ])

    await callAnthropic({
      apiKey: 'k',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      imageBytes: new Uint8Array([1, 2, 3]),
    })

    const body = JSON.parse(fetchFn.mock.calls[0]![1]!.body as string) as {
      messages: Array<{ role: string; content: unknown }>
    }
    const content = body.messages[0]!.content as Array<Record<string, unknown>>
    expect(Array.isArray(content)).toBe(true)

    const image = content[0] as {
      type: string
      source: { type: string; media_type: string; data: string }
    }
    expect(image.type).toBe('image')
    expect(image.source.type).toBe('base64')
    expect(image.source.media_type).toBe('image/png')
    expect(typeof image.source.data).toBe('string')
    expect(image.source.data.length).toBeGreaterThan(0)

    const text = content[1] as { type: string; text: string }
    expect(text).toEqual({ type: 'text', text: 'usr' })
  })
})
