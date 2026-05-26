import { describe, expect, it, beforeEach } from 'vitest'
import {
  isOursTail,
  buildLabel,
  syncAnnotation,
  clearAnnotation,
  writeAiAnnotation,
  appendTicketIdToAnnotation,
  clearAiAnnotation,
} from '../../src/sandbox/annotations'
import { installFigmaMock } from '../helpers/figmaMock'

describe('isOursTail', () => {
  it('matches bare AZURE label (manual-create form)', () => {
    expect(isOursTail('AZURE-12345')).toBe(true)
  })
  it('matches bare Notion label (manual-create form)', () => {
    expect(isOursTail('Notion · My ticket · #a1b2c3d4')).toBe(true)
  })
  it('matches em-dash suffix on multi-line AI-Draft label (Azure)', () => {
    expect(isOursTail('Spec body here\n\n— AZURE-99')).toBe(true)
  })
  it('matches em-dash suffix on multi-line AI-Draft label (Notion)', () => {
    expect(isOursTail('Spec body\n— Notion #deadbeef')).toBe(true)
  })
  it('does not match unrelated labels', () => {
    expect(isOursTail('manual designer note')).toBe(false)
    expect(isOursTail('JIRA-123')).toBe(false)
  })

  it('rejects manual annotations that look similar but do not match', () => {
    expect(isOursTail('AZURE-')).toBe(false)
    expect(isOursTail('AZURE-abc')).toBe(false)
    expect(isOursTail('Notion · no suffix')).toBe(false)
    expect(isOursTail('Notion · short id · #1234')).toBe(false)
    expect(isOursTail('arbitrary user annotation')).toBe(false)
    expect(isOursTail('')).toBe(false)
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

  it('round-trips: any label produced by buildLabel is recognised by isOursTail', () => {
    expect(
      isOursTail(
        buildLabel({ providerId: 'azure', ticketId: '42', title: 'x' }),
      ),
    ).toBe(true)
    expect(
      isOursTail(
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
  it('creates annotation (no categoryId) when none of ours exist', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    const result = await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(result).toEqual({ ok: true })
    expect(node.annotations).toEqual([{ label: 'AZURE-1234' }])
  })

  it('is a noop when an ours-pin already exists', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [{ label: 'AZURE-1234' }]
    const before = node.annotations
    const result = await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(result).toEqual({ ok: true })
    expect(node.annotations).toEqual([{ label: 'AZURE-1234' }])
    expect(node.annotations).toBe(before)
  })

  it('is a noop even when ours-pin label drifted (does not clobber existing)', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [{ label: 'AZURE-9999' }]
    await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(node.annotations).toEqual([{ label: 'AZURE-9999' }])
  })

  it('preserves manual annotations (non-ours) and writes ours without categoryId', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [{ label: 'Designer note: align padding' }]
    await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(node.annotations).toEqual([
      { label: 'Designer note: align padding' },
      { label: 'AZURE-1234' },
    ])
  })

  it('collapses duplicate ours-pins to a single canonical label, keeping manuals', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [
      { label: 'Designer note' },
      { label: 'AZURE-1234' },
      { label: 'AZURE-5555' },
    ]
    await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(node.annotations).toEqual([
      { label: 'Designer note' },
      { label: 'AZURE-1234' },
    ])
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

  it('returns unsupported-node for nodes lacking AnnotationsMixin (e.g. SECTION)', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'SECTION', 'Wireframes', { supportsAnnotations: false })
    const result = await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(result).toEqual({ ok: false, reason: 'unsupported-node' })
    // Must not have assigned anything onto the node.
    expect(node.annotations).toBeUndefined()
  })
})

describe('clearAnnotation', () => {
  it('removes all ours-pins, preserves manuals', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [
      { label: 'Designer note' },
      { label: 'AZURE-1234' },
      { label: 'Notion · X · #aabbccdd' },
    ]
    const result = await clearAnnotation('1:2')
    expect(result).toEqual({ ok: true })
    expect(node.annotations).toEqual([{ label: 'Designer note' }])
  })

  it('returns node-missing when node is gone', async () => {
    installFigmaMock()
    const result = await clearAnnotation('99:99')
    expect(result).toEqual({ ok: false, reason: 'node-missing' })
  })

  it('returns unsupported-node for nodes lacking AnnotationsMixin', async () => {
    const { makeNode } = installFigmaMock()
    makeNode('1:2', 'SECTION', 'Wireframes', { supportsAnnotations: false })
    const result = await clearAnnotation('1:2')
    expect(result).toEqual({ ok: false, reason: 'unsupported-node' })
  })
})

describe('writeAiAnnotation', () => {
  let mock: ReturnType<typeof installFigmaMock>
  beforeEach(() => {
    mock = installFigmaMock()
  })
  it('writes labelMarkdown without a categoryId and sets aiDraftPin', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    const r = await writeAiAnnotation('1:1', 'Hello\n**bold**')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([{ labelMarkdown: 'Hello\n**bold**' }])
    expect(node.getPluginData('aiDraftPin')).toBe('1')
  })
  it('preserves manual non-ours annotations', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [{ label: 'manual note' }]
    const r = await writeAiAnnotation('1:1', 'AI body')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([
      { label: 'manual note' },
      { labelMarkdown: 'AI body' },
    ])
  })
  it('replaces an existing ours-pin (does not stack)', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [{ labelMarkdown: 'old AI body' }]
    node.setPluginData('aiDraftPin', '1')
    const r = await writeAiAnnotation('1:1', 'new AI body')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([{ labelMarkdown: 'new AI body' }])
  })
  it('returns unsupported-node for SECTION-like nodes', async () => {
    mock.makeNode('1:1', 'SECTION', 'Section', { supportsAnnotations: false })
    const r = await writeAiAnnotation('1:1', 'body')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unsupported-node')
  })
})

describe('appendTicketIdToAnnotation', () => {
  let mock: ReturnType<typeof installFigmaMock>
  beforeEach(() => {
    mock = installFigmaMock()
  })
  it('appends — AZURE-<id> on a new line and clears aiDraftPin', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [{ labelMarkdown: 'AI body' }]
    node.setPluginData('aiDraftPin', '1')
    const r = await appendTicketIdToAnnotation('1:1', 'azure', '42')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([{ labelMarkdown: 'AI body\n— AZURE-42' }])
    expect(node.getPluginData('aiDraftPin')).toBe('')
  })
  it('appends — Notion #<short> using last 8 hex chars of the id', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [{ labelMarkdown: 'AI body' }]
    node.setPluginData('aiDraftPin', '1')
    const r = await appendTicketIdToAnnotation(
      '1:1',
      'notion',
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeedead',
    )
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([
      { labelMarkdown: 'AI body\n— Notion #eeeedead' },
    ])
  })
  it('self-heals when no draft pin exists (writes suffix-only label)', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    const r = await appendTicketIdToAnnotation('1:1', 'azure', '7')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([{ labelMarkdown: 'AZURE-7' }])
  })
  it('preserves manual non-ours annotations', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [{ label: 'manual' }, { labelMarkdown: 'AI body' }]
    node.setPluginData('aiDraftPin', '1')
    await appendTicketIdToAnnotation('1:1', 'azure', '9')
    expect(node.annotations).toEqual([
      { label: 'manual' },
      { labelMarkdown: 'AI body\n— AZURE-9' },
    ])
  })
})

describe('clearAiAnnotation', () => {
  let mock: ReturnType<typeof installFigmaMock>
  beforeEach(() => {
    mock = installFigmaMock()
  })
  it('removes ours-pin and clears the flag, preserving manual notes', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [{ label: 'manual' }, { labelMarkdown: 'AI body' }]
    node.setPluginData('aiDraftPin', '1')
    const r = await clearAiAnnotation('1:1')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([{ label: 'manual' }])
    expect(node.getPluginData('aiDraftPin')).toBe('')
  })
  it('also removes post-publish suffix labels', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [{ labelMarkdown: 'AI body\n— AZURE-1' }]
    const r = await clearAiAnnotation('1:1')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([])
  })
})

describe('annotation writes never include categoryId (regression)', () => {
  let mock: ReturnType<typeof installFigmaMock>
  beforeEach(() => {
    mock = installFigmaMock()
  })
  it('writeAiAnnotation entry has no categoryId key', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    await writeAiAnnotation('1:1', 'body')
    expect(node.annotations?.[0]).not.toHaveProperty('categoryId')
  })
  it('appendTicketIdToAnnotation self-heal entry has no categoryId key', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    await appendTicketIdToAnnotation('1:1', 'azure', '1')
    expect(node.annotations?.[0]).not.toHaveProperty('categoryId')
  })
})
