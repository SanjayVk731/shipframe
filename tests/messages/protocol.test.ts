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
      | 'focus-node'
      | 'open-external'
      | 'sync-annotation'
      | 'clear-annotation'
      | 'get-frame-context'
    >()
  })
})

describe('protocol — annotation + frame-context messages', () => {
  it('recognises sync-annotation UI→sandbox', () => {
    expect(
      isUiToSandbox({
        type: 'sync-annotation',
        nodeId: '1:2',
        providerId: 'azure',
        ticketId: '1234',
        title: 'x',
        requestId: 'r1',
      }),
    ).toBe(true)
  })

  it('recognises clear-annotation UI→sandbox', () => {
    expect(
      isUiToSandbox({
        type: 'clear-annotation',
        nodeId: '1:2',
        requestId: 'r1',
      }),
    ).toBe(true)
  })

  it('recognises get-frame-context UI→sandbox', () => {
    expect(
      isUiToSandbox({
        type: 'get-frame-context',
        nodeId: '1:2',
        workItemType: 'Bug',
        requestId: 'r1',
      }),
    ).toBe(true)
  })

  it('recognises frame-context sandbox→UI response', () => {
    expect(
      isSandboxToUi({
        type: 'frame-context',
        context: {
          frameName: 'Login',
          workItemType: 'Bug',
          annotations: [],
          textLayers: [],
        },
        requestId: 'r1',
      }),
    ).toBe(true)
  })
})
