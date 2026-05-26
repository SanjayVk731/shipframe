import { afterEach, describe, expect, it, vi } from 'vitest'
import { draftFromContext } from '../../../src/ui/ai/draft'
import { installFetch, jsonResponse } from '../../helpers/fetchMock'
import type { FrameContext } from '../../../src/shared/types'

const ctx: FrameContext = {
  frameName: 'Login',
  workItemType: 'Bug',
  annotations: ['Submit broken'],
  textLayers: ['Sign in'],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('draftFromContext (Anthropic)', () => {
  it('returns parsed JSON on 200 happy path', async () => {
    installFetch([
      {
        matches: (url) => url.includes('api.anthropic.com'),
        response: () =>
          jsonResponse(200, {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  title: 'T',
                  main: 'M',
                  reproSteps: 'R',
                  expected: 'E',
                  actual: 'A',
                }),
              },
            ],
          }),
      },
    ])
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' }, new Uint8Array([1]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.title).toBe('T')
    expect(r.value.acceptanceCriteria).toBeUndefined() // Bug → AC dropped
  })

  it('sets the dangerous-direct-browser-access header', async () => {
    let capturedInit: RequestInit | undefined
    installFetch([
      {
        matches: (url, init) => {
          if (url.includes('api.anthropic.com')) {
            capturedInit = init
            return true
          }
          return false
        },
        response: () => jsonResponse(200, { content: [{ type: 'text', text: '{}' }] }),
      },
    ])
    await draftFromContext(ctx, { provider: 'anthropic', key: 'k' }, new Uint8Array([1]))
    const headers = capturedInit?.headers as Record<string, string> | undefined
    expect(headers?.['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(headers?.['anthropic-version']).toBe('2023-06-01')
    expect(headers?.['x-api-key']).toBe('k')
  })

  it('returns auth_failed on 401', async () => {
    installFetch([
      { matches: () => true, response: () => jsonResponse(401, { error: 'bad key' }) },
    ])
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' }, new Uint8Array([1]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('auth_failed')
  })

  it('returns rate_limited on 429', async () => {
    installFetch([{ matches: () => true, response: () => jsonResponse(429, {}) }])
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' }, new Uint8Array([1]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('rate_limited')
  })

  it('returns server_error on 500', async () => {
    installFetch([{ matches: () => true, response: () => jsonResponse(500, {}) }])
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' }, new Uint8Array([1]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('server_error')
  })

  it('returns network_error when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom')
      }),
    )
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' }, new Uint8Array([1]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('network_error')
  })

  it('retries once on malformed JSON, then succeeds', async () => {
    let call = 0
    installFetch([
      {
        matches: (url) => url.includes('api.anthropic.com'),
        response: () => {
          call += 1
          if (call === 1) {
            return jsonResponse(200, { content: [{ type: 'text', text: 'not json' }] })
          }
          return jsonResponse(200, {
            content: [{ type: 'text', text: '{"title":"T"}' }],
          })
        },
      },
    ])
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' }, new Uint8Array([1]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.title).toBe('T')
    expect(call).toBe(2)
  })

  it('returns unknown reason after retry still malformed', async () => {
    installFetch([
      {
        matches: () => true,
        response: () => jsonResponse(200, { content: [{ type: 'text', text: 'not json' }] }),
      },
    ])
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' }, new Uint8Array([1]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('unknown')
  })
})

describe('draftFromContext (Azure OpenAI)', () => {
  const endpoint =
    'https://mycorp.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21'

  it('routes to the configured endpoint with api-key header (no Authorization)', async () => {
    let capturedUrl: string | undefined
    let capturedInit: RequestInit | undefined
    installFetch([
      {
        matches: (url, init) => {
          if (url.includes('mycorp.openai.azure.com')) {
            capturedUrl = url
            capturedInit = init
            return true
          }
          return false
        },
        response: () =>
          jsonResponse(200, {
            choices: [{ message: { content: '{"title":"T"}' } }],
          }),
      },
    ])
    await draftFromContext(
      ctx,
      {
        provider: 'azure-openai',
        key: 'azkey',
        endpoint,
      },
      new Uint8Array([1]),
    )
    expect(capturedUrl).toBe(endpoint)
    const headers = capturedInit?.headers as Record<string, string> | undefined
    expect(headers?.['api-key']).toBe('azkey')
    expect(headers?.['authorization']).toBeUndefined()
    const body = JSON.parse(capturedInit?.body as string) as {
      model?: string
      response_format?: { type?: string }
    }
    expect(body.model).toBeUndefined()
    expect(body.response_format?.type).toBe('json_object')
  })

  it('returns parsed JSON on 200 happy path', async () => {
    installFetch([
      {
        matches: (url) => url.includes('mycorp.openai.azure.com'),
        response: () =>
          jsonResponse(200, {
            choices: [{ message: { content: '{"title":"T","main":"M"}' } }],
          }),
      },
    ])
    const r = await draftFromContext(
      ctx,
      {
        provider: 'azure-openai',
        key: 'k',
        endpoint,
      },
      new Uint8Array([1]),
    )
    expect(r.ok && r.value.title).toBe('T')
  })

  it('returns auth_failed on 401', async () => {
    installFetch([
      { matches: () => true, response: () => jsonResponse(401, { error: 'bad key' }) },
    ])
    const r = await draftFromContext(
      ctx,
      {
        provider: 'azure-openai',
        key: 'k',
        endpoint,
      },
      new Uint8Array([1]),
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('auth_failed')
  })

  it('returns not_found on 404 (wrong deployment)', async () => {
    installFetch([{ matches: () => true, response: () => jsonResponse(404, {}) }])
    const r = await draftFromContext(
      ctx,
      {
        provider: 'azure-openai',
        key: 'k',
        endpoint,
      },
      new Uint8Array([1]),
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('not_found')
  })

  it('returns auth_failed without calling fetch when endpoint is missing', async () => {
    const fetchFn = vi.fn()
    vi.stubGlobal('fetch', fetchFn)
    const r = await draftFromContext(
      ctx,
      {
        provider: 'azure-openai',
        key: 'k',
        // endpoint omitted deliberately — defensive guard in draft.ts
      } as unknown as Parameters<typeof draftFromContext>[1],
      new Uint8Array([1]),
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('auth_failed')
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('draftFromContext (OpenAI)', () => {
  it('uses Authorization: Bearer header', async () => {
    let capturedInit: RequestInit | undefined
    installFetch([
      {
        matches: (url, init) => {
          if (url.includes('api.openai.com')) {
            capturedInit = init
            return true
          }
          return false
        },
        response: () =>
          jsonResponse(200, {
            choices: [{ message: { content: '{"title":"T"}' } }],
          }),
      },
    ])
    await draftFromContext(ctx, { provider: 'openai', key: 'k' }, new Uint8Array([1]))
    const headers = capturedInit?.headers as Record<string, string> | undefined
    expect(headers?.['authorization']).toBe('Bearer k')
  })

  it('returns parsed JSON on 200 happy path', async () => {
    installFetch([
      {
        matches: (url) => url.includes('api.openai.com'),
        response: () =>
          jsonResponse(200, {
            choices: [{ message: { content: '{"title":"T","main":"M"}' } }],
          }),
      },
    ])
    const r = await draftFromContext(ctx, { provider: 'openai', key: 'k' }, new Uint8Array([1]))
    expect(r.ok && r.value.title).toBe('T')
  })
})

describe('draftFromContext image + pin fallback', () => {
  it('forwards image content to the adapter (anthropic shape)', async () => {
    const fetchFn = installFetch([
      {
        matches: (url) => url.includes('api.anthropic.com'),
        response: () =>
          jsonResponse(200, {
            content: [
              { type: 'text', text: JSON.stringify({ title: 'T', main: 'M', pinMarkdown: 'P' }) },
            ],
          }),
      },
    ])
    const r = await draftFromContext(
      { frameName: 'F', workItemType: 'Bug', annotations: [], textLayers: ['Hello'] },
      { provider: 'anthropic', key: 'k' },
      new Uint8Array([1, 2, 3]),
    )
    expect(r.ok).toBe(true)
    const body = JSON.parse(fetchFn.mock.calls[0]![1]!.body as string)
    expect(body.messages[0].content[0].type).toBe('image')
  })

  it('synthesizes pinMarkdown when the LLM omits it', async () => {
    installFetch([
      {
        matches: (url) => url.includes('api.anthropic.com'),
        response: () =>
          jsonResponse(200, {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ title: 'Login broken', main: 'Submit fails on enter.\nMore detail.' }),
              },
            ],
          }),
      },
    ])
    const r = await draftFromContext(
      { frameName: 'F', workItemType: 'Bug', annotations: [], textLayers: [] },
      { provider: 'anthropic', key: 'k' },
      new Uint8Array([1]),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.pinMarkdown).toBeDefined()
      expect(r.value.pinMarkdown).toContain('Login broken')
      expect(r.value.pinMarkdown).toContain('Submit fails on enter.')
      expect(r.value.pinMarkdown).not.toContain('More detail.')
    }
  })
})
