import { describe, it, expect, expectTypeOf } from 'vitest'
import { isUiToSandbox, isSandboxToUi } from '../../src/messages/protocol'
import type { UiToSandbox, SandboxToUi } from '../../src/messages/protocol'

describe('protocol guards', () => {
  it('accepts known UiToSandbox shapes', () => {
    const m: UiToSandbox = { type: 'get-selection-state', requestId: 'r1' }
    expect(isUiToSandbox(m)).toBe(true)
  })

  it('rejects unknown UiToSandbox shapes', () => {
    expect(isUiToSandbox({ type: 'nope' })).toBe(false)
    expect(isUiToSandbox(null)).toBe(false)
    expect(isUiToSandbox('string')).toBe(false)
  })

  it('accepts known SandboxToUi shapes including pushed selection-changed', () => {
    const a: SandboxToUi = {
      type: 'selection-state',
      state: { kind: 'none' },
      requestId: 'r1',
    }
    const b: SandboxToUi = {
      type: 'selection-changed',
      state: { kind: 'none' },
    }
    expect(isSandboxToUi(a)).toBe(true)
    expect(isSandboxToUi(b)).toBe(true)
  })

  it('UiToSandbox is a discriminated union on `type`', () => {
    expectTypeOf<UiToSandbox['type']>().toEqualTypeOf<
      | 'get-selection-state'
      | 'export-thumbnail'
      | 'write-ticket-link'
      | 'clear-ticket-link'
      | 'get-file-config'
      | 'set-file-config'
      | 'get-pat'
      | 'set-pat'
      | 'get-file-info'
      | 'open-external'
    >()
  })
})
