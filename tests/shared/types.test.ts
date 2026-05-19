import { describe, it, expectTypeOf } from 'vitest'
import type {
  ProviderId,
  TicketLink,
  FileConfig,
  SelectionState,
  TicketInput,
} from '../../src/shared/types'

describe('shared types', () => {
  it('ProviderId is a closed union', () => {
    expectTypeOf<ProviderId>().toEqualTypeOf<'notion' | 'azure'>()
  })

  it('TicketLink has required fields', () => {
    const link: TicketLink = {
      id: 'AZURE-1',
      url: 'https://example/AZURE-1',
      providerId: 'azure',
      createdAt: '2026-05-19T00:00:00Z',
    }
    expectTypeOf(link.id).toBeString()
  })

  it('SelectionState covers all branches', () => {
    const empty: SelectionState = { kind: 'none' }
    const multi: SelectionState = { kind: 'multi' }
    const wrong: SelectionState = { kind: 'unsupported' }
    const single: SelectionState = {
      kind: 'single',
      nodeId: '1:2',
      nodeName: 'Frame',
      link: null,
    }
    expectTypeOf(empty).toMatchTypeOf<SelectionState>()
    expectTypeOf(multi).toMatchTypeOf<SelectionState>()
    expectTypeOf(wrong).toMatchTypeOf<SelectionState>()
    expectTypeOf(single).toMatchTypeOf<SelectionState>()
  })

  it('TicketInput captures required fields', () => {
    const t: TicketInput = {
      title: 't',
      description: 'd',
      type: 'Bug',
      priority: '2',
      assigneeId: null,
      labelIds: [],
      figmaDeepLink: 'https://figma.com/...',
    }
    expectTypeOf(t.labelIds).toEqualTypeOf<string[]>()
  })
})
