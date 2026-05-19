import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tryRequest } from '../../src/providers/tryRequest'

beforeEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = vi.fn()
})

function mockFetch(status: number, body: unknown = {}) {
  ;(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response)
}

describe('tryRequest', () => {
  it('returns ok on 2xx', async () => {
    mockFetch(200, { hello: 'world' })
    const res = await tryRequest(() => fetch('https://x'))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.status).toBe(200)
  })

  it('normalizes 401 to auth_failed', async () => {
    mockFetch(401)
    const res = await tryRequest(() => fetch('https://x'))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('auth_failed')
  })

  it('normalizes 403 to auth_failed', async () => {
    mockFetch(403)
    const res = await tryRequest(() => fetch('https://x'))
    if (!res.ok) expect(res.reason).toBe('auth_failed')
  })

  it('normalizes 404 to not_found', async () => {
    mockFetch(404)
    const res = await tryRequest(() => fetch('https://x'))
    if (!res.ok) expect(res.reason).toBe('not_found')
  })

  it('normalizes 429 to rate_limited', async () => {
    mockFetch(429)
    const res = await tryRequest(() => fetch('https://x'))
    if (!res.ok) expect(res.reason).toBe('rate_limited')
  })

  it('normalizes 500 to server_error', async () => {
    mockFetch(503)
    const res = await tryRequest(() => fetch('https://x'))
    if (!res.ok) expect(res.reason).toBe('server_error')
  })

  it('returns network_error when fetch throws', async () => {
    ;(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    )
    const res = await tryRequest(() => fetch('https://x'))
    if (!res.ok) expect(res.reason).toBe('network_error')
  })

  it('returns unknown for other status codes', async () => {
    mockFetch(418)
    const res = await tryRequest(() => fetch('https://x'))
    if (!res.ok) expect(res.reason).toBe('unknown')
  })
})
