import { useCallback, useEffect, useRef, useState } from 'react'
import type { UiToSandbox, SandboxToUi } from '../../messages/protocol'
import { isSandboxToUi } from '../../messages/protocol'
import type { SelectionState } from '../../shared/types'

type WithoutRequestId<T> = T extends { requestId: string }
  ? Omit<T, 'requestId'>
  : T

export interface UseSandboxApi {
  selection: SelectionState
  request: <T extends SandboxToUi['type'] = SandboxToUi['type']>(
    msg: WithoutRequestId<UiToSandbox>,
  ) => Promise<Extract<SandboxToUi, { type: T }>>
}

let counter = 0
function nextRequestId(): string {
  counter += 1
  return `r${Date.now()}-${counter}`
}

export function useSandbox(): UseSandboxApi {
  const [selection, setSelection] = useState<SelectionState>({ kind: 'none' })
  const pending = useRef(
    new Map<string, (msg: SandboxToUi) => void>(),
  )

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const raw = (event.data as { pluginMessage?: unknown })?.pluginMessage
      if (!isSandboxToUi(raw)) return
      const msg = raw as SandboxToUi
      if (msg.type === 'selection-changed') {
        setSelection(msg.state)
        return
      }
      if ('requestId' in msg) {
        const resolve = pending.current.get(msg.requestId)
        if (resolve) {
          pending.current.delete(msg.requestId)
          resolve(msg)
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const request = useCallback<UseSandboxApi['request']>((msg) => {
    if (msg.type === 'open-external') {
      window.parent.postMessage({ pluginMessage: msg }, '*')
      return Promise.resolve({ type: 'ack', requestId: '' } as never)
    }
    return new Promise((resolve) => {
      const requestId = nextRequestId()
      pending.current.set(requestId, resolve as (m: SandboxToUi) => void)
      window.parent.postMessage(
        { pluginMessage: { ...msg, requestId } as UiToSandbox },
        '*',
      )
    })
  }, [])

  return { selection, request }
}
