import { useCallback } from 'react'
import { getProvider } from '../../providers/registry'
import type { ProviderId } from '../../shared/types'
import type { Result } from '../../providers/types'

export function useProvider(id: ProviderId) {
  const provider = getProvider(id)
  return {
    provider,
    call: useCallback(
      async function call<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
        return fn()
      },
      [],
    ),
  }
}
