import { vi } from 'vitest'

interface Stub {
  matches: (url: string, init?: RequestInit) => boolean
  response: () => Response
}

export function installFetch(stubs: Stub[]) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    for (const stub of stubs) {
      if (stub.matches(url, init)) return stub.response()
    }
    throw new Error(`unmatched fetch ${url}`)
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
