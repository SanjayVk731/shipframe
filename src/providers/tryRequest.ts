import type { Result } from './types'

export async function tryRequest<T>(
  call: () => Promise<Response>,
  parse?: (res: Response) => Promise<T>,
): Promise<Result<T>> {
  let res: Response
  try {
    res = await call()
  } catch {
    return { ok: false, reason: 'network_error', status: 0 }
  }

  if (res.ok) {
    try {
      const value = (parse ? await parse(res) : ((await res.json()) as T)) as T
      return { ok: true, value, status: res.status }
    } catch {
      return { ok: false, reason: 'unknown', status: res.status }
    }
  }

  const detail = await res.text().catch(() => undefined)
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: 'auth_failed', status: res.status, detail }
  }
  if (res.status === 404) {
    return { ok: false, reason: 'not_found', status: res.status, detail }
  }
  if (res.status === 429) {
    return { ok: false, reason: 'rate_limited', status: res.status, detail }
  }
  if (res.status >= 500) {
    return { ok: false, reason: 'server_error', status: res.status, detail }
  }
  return { ok: false, reason: 'unknown', status: res.status, detail }
}
