import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSandbox } from '../../src/ui/hooks/useSandbox'

function installParent() {
  ;(window as unknown as { parent: Window }).parent = {
    postMessage: vi.fn(),
  } as unknown as Window
}

function emitFromSandbox(msg: unknown) {
  window.dispatchEvent(
    new MessageEvent('message', { data: { pluginMessage: msg } }),
  )
}

beforeEach(() => {
  installParent()
})

describe('useSandbox', () => {
  it('request resolves on matching response', async () => {
    const { result } = renderHook(() => useSandbox())
    let resolved: unknown
    await act(async () => {
      const p = result.current.request({
        type: 'get-selection-state',
      })
      // Capture the requestId that was generated.
      const sentRaw =
        (window.parent.postMessage as unknown as ReturnType<typeof vi.fn>)
          .mock.calls[0]?.[0]
      const sent = (sentRaw as { pluginMessage: { requestId: string } })
        .pluginMessage
      emitFromSandbox({
        type: 'selection-state',
        state: { kind: 'none' },
        requestId: sent.requestId,
      })
      resolved = await p
    })
    expect(resolved).toEqual({ type: 'selection-state', state: { kind: 'none' }, requestId: expect.any(String) })
  })

  it('pushed selection-changed updates state', async () => {
    const { result } = renderHook(() => useSandbox())
    await act(async () => {
      emitFromSandbox({
        type: 'selection-changed',
        state: { kind: 'multi' },
      })
    })
    expect(result.current.selection).toEqual({ kind: 'multi' })
  })
})
