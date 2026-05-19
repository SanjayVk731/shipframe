import { describe, expect, it } from 'vitest'
import { isOursLabel, buildLabel, syncAnnotation, clearAnnotation } from '../../src/sandbox/annotations'
import { installFigmaMock } from '../helpers/figmaMock'

describe('isOursLabel', () => {
  it('matches Azure ticket labels', () => {
    expect(isOursLabel('AZURE-1234')).toBe(true)
    expect(isOursLabel('AZURE-1')).toBe(true)
  })

  it('matches Notion labels with short-id suffix', () => {
    expect(isOursLabel('Notion · Login bug · #a1b2c3d4')).toBe(true)
    expect(isOursLabel('Notion · Anything goes here · #00000000')).toBe(true)
  })

  it('rejects manual annotations that look similar but do not match', () => {
    expect(isOursLabel('AZURE-')).toBe(false)
    expect(isOursLabel('AZURE-abc')).toBe(false)
    expect(isOursLabel('Notion · no suffix')).toBe(false)
    expect(isOursLabel('Notion · short id · #1234')).toBe(false)
    expect(isOursLabel('arbitrary user annotation')).toBe(false)
    expect(isOursLabel('')).toBe(false)
  })
})

describe('buildLabel', () => {
  it('builds Azure label from numeric id', () => {
    expect(
      buildLabel({ providerId: 'azure', ticketId: '1234', title: 'Anything' }),
    ).toBe('AZURE-1234')
  })

  it('builds Notion label with title and 8-char short id', () => {
    expect(
      buildLabel({
        providerId: 'notion',
        ticketId: 'abcd1234-ef56-7890-abcd-ef1234567890',
        title: 'Login bug',
      }),
    ).toBe('Notion · Login bug · #34567890')
  })

  it('truncates long titles at 60 chars with ellipsis', () => {
    const longTitle = 'a'.repeat(80)
    const label = buildLabel({
      providerId: 'notion',
      ticketId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0000',
      title: longTitle,
    })
    expect(label.startsWith('Notion · ' + 'a'.repeat(59) + '…')).toBe(true)
    expect(label.endsWith(' · #eeee0000')).toBe(true)
    expect(label).toMatch(/^Notion · a{59}… · #[0-9a-f]{8}$/)
  })

  it('round-trips: any label produced by buildLabel is recognised by isOursLabel', () => {
    expect(
      isOursLabel(
        buildLabel({ providerId: 'azure', ticketId: '42', title: 'x' }),
      ),
    ).toBe(true)
    expect(
      isOursLabel(
        buildLabel({
          providerId: 'notion',
          ticketId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeffff',
          title: 'x',
        }),
      ),
    ).toBe(true)
  })
})

describe('syncAnnotation', () => {
  it('creates annotation when none of ours exist', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    const result = await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(result).toEqual({ ok: true })
    expect(node.annotations).toEqual([{ label: 'AZURE-1234', categoryId: 'azure' }])
  })

  it('is a noop when matching annotation already exists', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [{ label: 'AZURE-1234', categoryId: 'azure' }]
    const before = node.annotations
    const result = await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(result).toEqual({ ok: true })
    expect(node.annotations).toEqual([{ label: 'AZURE-1234', categoryId: 'azure' }])
    expect(node.annotations).toBe(before)
  })

  it('updates label when ours exists with drifted label', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [
      { label: 'AZURE-9999', categoryId: 'azure' },
    ]
    await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(node.annotations).toEqual([{ label: 'AZURE-1234', categoryId: 'azure' }])
  })

  it('preserves manual annotations (non-ours)', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [
      { label: 'Designer note: align padding', categoryId: 'general' },
    ]
    await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(node.annotations).toEqual([
      { label: 'Designer note: align padding', categoryId: 'general' },
      { label: 'AZURE-1234', categoryId: 'azure' },
    ])
  })

  it('removes duplicate ours-pins, keeps first match of target label', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [
      { label: 'AZURE-1234', categoryId: 'azure' },
      { label: 'AZURE-1234', categoryId: 'azure' },
      { label: 'AZURE-5555', categoryId: 'azure' },
    ]
    await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(node.annotations).toEqual([{ label: 'AZURE-1234', categoryId: 'azure' }])
  })

  it('returns node-missing when getNodeByIdAsync resolves null', async () => {
    installFigmaMock() // empty: no nodes registered
    const result = await syncAnnotation('99:99', {
      providerId: 'azure',
      ticketId: '1',
      title: 't',
    })
    expect(result).toEqual({ ok: false, reason: 'node-missing' })
  })

  it('returns api-unavailable when figma.annotations is undefined', async () => {
    const { makeNode, figma } = installFigmaMock()
    makeNode('1:2', 'FRAME', 'Login')
    // Simulate older Figma without annotations API
    delete (figma as any).annotations
    const result = await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1',
      title: 't',
    })
    expect(result).toEqual({ ok: false, reason: 'api-unavailable' })
  })
})

describe('clearAnnotation', () => {
  it('removes all ours-pins, preserves manuals', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [
      { label: 'Designer note', categoryId: 'general' },
      { label: 'AZURE-1234', categoryId: 'azure' },
      { label: 'Notion · X · #aabbccdd', categoryId: 'notion' },
    ]
    const result = await clearAnnotation('1:2')
    expect(result).toEqual({ ok: true })
    expect(node.annotations).toEqual([
      { label: 'Designer note', categoryId: 'general' },
    ])
  })

  it('returns node-missing when node is gone', async () => {
    installFigmaMock()
    const result = await clearAnnotation('99:99')
    expect(result).toEqual({ ok: false, reason: 'node-missing' })
  })
})
