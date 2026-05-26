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

      // `selection-changed` is the ONLY legitimately-unsolicited message (a push
      // event with no requestId). Everything else is a reply and must correlate
      // to a request we actually made — otherwise we drop it. The Figma plugin
      // iframe runs at origin `null`, so requestId correlation (not event.origin)
      // is the practical guard against a spoofed parent forging replies such as
      // `pat`/`ai-config` (credential injection) or a `selection-state` driving
      // the UI into an attacker-chosen view.
      if (msg.type === 'selection-changed') {
        setSelection(msg.state)
        return
      }

      if (!('requestId' in msg)) return
      const resolve = pending.current.get(msg.requestId)
      if (!resolve) return
      pending.current.delete(msg.requestId)

      // A solicited `selection-state` reply also refreshes local selection.
      if (msg.type === 'selection-state') setSelection(msg.state)
      resolve(msg)
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
