import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classifySelection, exportThumbnail } from '../../src/sandbox/selection'

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

describe('exportThumbnail', () => {
  function exportableNode(width: number, height: number) {
    const exportAsync = vi.fn(async () => new Uint8Array([1, 2, 3]))
    const node = {
      id: '1:1',
      name: 'n',
      type: 'FRAME',
      width,
      height,
      getPluginData: vi.fn(() => ''),
      setPluginData: vi.fn(),
      exportAsync,
    }
    return { node: node as unknown as SceneNode, exportAsync }
  }

  it('uses scale 2 for small nodes', async () => {
    const { node, exportAsync } = exportableNode(800, 600)
    await exportThumbnail(node)
    expect(exportAsync).toHaveBeenCalledWith({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2 },
    })
  })

  it('caps oversized nodes at 2048 longest edge', async () => {
    const { node, exportAsync } = exportableNode(4096, 1024)
    await exportThumbnail(node)
    expect(exportAsync).toHaveBeenCalledWith({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2048 / 4096 },
    })
  })

  it('handles height-dominant oversized nodes', async () => {
    const { node, exportAsync } = exportableNode(500, 5000)
    await exportThumbnail(node)
    expect(exportAsync).toHaveBeenCalledWith({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2048 / 5000 },
    })
  })

  it('returns { bytes, oversized: false } when under the size cap', async () => {
    const { node } = exportableNode(800, 600)
    const result = await exportThumbnail(node)
    expect(result.oversized).toBe(false)
    expect(result.bytes).toBeInstanceOf(Uint8Array)
    expect(result.bytes!.length).toBe(3)
  })

  it('returns { bytes: null, oversized: true } when export exceeds 5MB', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1)
    const node = {
      id: '1:1',
      name: 'n',
      type: 'SECTION',
      width: 4000,
      height: 3000,
      getPluginData: vi.fn(() => ''),
      setPluginData: vi.fn(),
      exportAsync: vi.fn(async () => big),
    } as unknown as SceneNode
    const result = await exportThumbnail(node)
    expect(result.oversized).toBe(true)
    expect(result.bytes).toBeNull()
  })
})
