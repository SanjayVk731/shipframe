import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classifySelection } from '../../src/sandbox/selection'

function n(type: string, overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    id: '1:1',
    name: 'Node',
    type,
    getPluginData: vi.fn(() => ''),
    setPluginData: vi.fn(),
    ...overrides,
  } as unknown as SceneNode
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('classifySelection', () => {
  it('empty', () => {
    expect(classifySelection([])).toEqual({ kind: 'none' })
  })

  it('multi', () => {
    expect(
      classifySelection([n('FRAME'), n('FRAME')]),
    ).toEqual({ kind: 'multi' })
  })

  it('unsupported single', () => {
    expect(classifySelection([n('TEXT')])).toEqual({ kind: 'unsupported' })
  })

  it('single frame without link', () => {
    const node = n('FRAME', { id: '1:2', name: 'Hero' } as Partial<SceneNode>)
    const s = classifySelection([node])
    expect(s.kind).toBe('single')
    if (s.kind === 'single') {
      expect(s.nodeId).toBe('1:2')
      expect(s.nodeName).toBe('Hero')
      expect(s.link).toBeNull()
    }
  })

  it('accepts COMPONENT and SECTION as single', () => {
    const a = classifySelection([n('COMPONENT')])
    const b = classifySelection([n('SECTION')])
    expect(a.kind).toBe('single')
    expect(b.kind).toBe('single')
  })

  it('reads link from node', () => {
    const link = {
      id: 'AZ-1',
      url: 'https://x',
      providerId: 'azure' as const,
      createdAt: '2026-05-19T00:00:00Z',
    }
    const node = n('FRAME', {
      getPluginData: vi.fn((k: string) =>
        k === 'ticketLink' ? JSON.stringify(link) : '',
      ),
    } as Partial<SceneNode>)
    const s = classifySelection([node])
    if (s.kind === 'single') expect(s.link).toEqual(link)
  })
})
