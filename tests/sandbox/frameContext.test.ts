import { describe, expect, it } from 'vitest'
import { collectFrameContext, FRAME_CONTEXT_LIMITS } from '../../src/sandbox/frameContext'
import { installFigmaMock, type MockNode } from '../helpers/figmaMock'

function withPluginData(
  node: Omit<MockNode, 'pluginData' | 'getPluginData' | 'setPluginData'>,
): MockNode {
  const pluginData = new Map<string, string>()
  return {
    ...node,
    pluginData,
    getPluginData: (k: string) => pluginData.get(k) ?? '',
    setPluginData: (k: string, v: string) => {
      if (v === '') pluginData.delete(k)
      else pluginData.set(k, v)
    },
  }
}

function text(id: string, characters: string, visible = true): MockNode {
  return withPluginData({
    id,
    type: 'TEXT',
    name: 'text',
    children: [],
    characters,
    visible,
    annotations: [],
  })
}

describe('collectFrameContext', () => {
  it('returns frameName and empty arrays on an empty frame', async () => {
    const { makeNode } = installFigmaMock()
    makeNode('1:0', 'FRAME', 'Login')
    const ctx = await collectFrameContext('1:0', 'Bug')
    expect(ctx.ok).toBe(true)
    if (!ctx.ok) return
    expect(ctx.value).toEqual({
      frameName: 'Login',
      workItemType: 'Bug',
      annotations: [],
      textLayers: [],
    })
  })

  it('collects TEXT.characters from direct children, top-down', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:0', 'FRAME', 'Login', {
      children: [text('1:1', 'Sign in'), text('1:2', 'Email'), text('1:3', 'Password')],
    })
    void node
    const ctx = await collectFrameContext('1:0', undefined)
    expect(ctx.ok && ctx.value.textLayers).toEqual(['Sign in', 'Email', 'Password'])
  })

  it('recurses into nested frames up to depth cap (5)', async () => {
    const { makeNode } = installFigmaMock()
    function deepChild(d: number): MockNode {
      const child = text(`t:${d}`, `level-${d}`)
      if (d >= 6) {
        return withPluginData({
          id: `f:${d}`,
          type: 'FRAME',
          name: `f${d}`,
          children: [child],
          visible: true,
          annotations: [],
        })
      }
      return withPluginData({
        id: `f:${d}`,
        type: 'FRAME',
        name: `f${d}`,
        children: [child, deepChild(d + 1)],
        visible: true,
        annotations: [],
      })
    }
    makeNode('1:0', 'FRAME', 'root', { children: [deepChild(1)] })
    const ctx = await collectFrameContext('1:0', undefined)
    expect(ctx.ok && ctx.value.textLayers).toEqual([
      'level-1',
      'level-2',
      'level-3',
      'level-4',
      'level-5',
    ])
  })

  it('stops collecting at FRAME_CONTEXT_LIMITS.maxTextNodes (50)', async () => {
    const { makeNode } = installFigmaMock()
    const children: MockNode[] = []
    for (let i = 0; i < 60; i++) children.push(text(`t:${i}`, `n${i}`))
    makeNode('1:0', 'FRAME', 'root', { children })
    const ctx = await collectFrameContext('1:0', undefined)
    expect(FRAME_CONTEXT_LIMITS.maxTextNodes).toBe(50)
    expect(ctx.ok && ctx.value.textLayers.length).toBe(51) // 50 + 1 summary line
    expect(ctx.ok && ctx.value.textLayers[50]).toBe('…and 10 more text nodes truncated')
  })

  it('truncates a single text node at maxCharsPerNode (300)', async () => {
    const { makeNode } = installFigmaMock()
    const long = 'a'.repeat(500)
    makeNode('1:0', 'FRAME', 'root', { children: [text('1:1', long)] })
    const ctx = await collectFrameContext('1:0', undefined)
    expect(ctx.ok).toBe(true)
    if (!ctx.ok) return
    expect(ctx.value.textLayers[0]?.length).toBe(300)
    expect(ctx.value.textLayers[0]?.endsWith('…')).toBe(true)
  })

  it('caps annotations at maxAnnotations (20)', async () => {
    const { makeNode } = installFigmaMock()
    const root = makeNode('1:0', 'FRAME', 'root')
    root.annotations = Array.from({ length: 30 }, (_, i) => ({
      label: `a${i}`,
      categoryId: 'c',
    }))
    const ctx = await collectFrameContext('1:0', undefined)
    expect(ctx.ok && ctx.value.annotations.length).toBe(20)
    expect(ctx.ok && ctx.value.annotations[0]).toBe('a0')
  })

  it('returns node-missing when node is gone', async () => {
    installFigmaMock()
    const ctx = await collectFrameContext('99:99', undefined)
    expect(ctx).toEqual({ ok: false, reason: 'node-missing' })
  })

  it('skips invisible nodes', async () => {
    const { makeNode } = installFigmaMock()
    makeNode('1:0', 'FRAME', 'root', {
      children: [text('t:1', 'visible'), text('t:2', 'hidden', false)],
    })
    const ctx = await collectFrameContext('1:0', undefined)
    expect(ctx.ok && ctx.value.textLayers).toEqual(['visible'])
  })

  it('applies maxTotalChars cap across text layers', async () => {
    const { makeNode } = installFigmaMock()
    // 30 text nodes of 300 chars each = 9000 chars > 8000 cap
    const children: MockNode[] = []
    for (let i = 0; i < 30; i++) children.push(text(`t:${i}`, 'a'.repeat(300)))
    makeNode('1:0', 'FRAME', 'root', { children })
    const ctx = await collectFrameContext('1:0', undefined)
    expect(ctx.ok).toBe(true)
    if (!ctx.ok) return
    const total = ctx.value.textLayers
      .filter((l) => !l.startsWith('…and '))
      .reduce((sum, l) => sum + l.length, 0)
    expect(total).toBeLessThanOrEqual(FRAME_CONTEXT_LIMITS.maxTotalChars)
    const layers = ctx.value.textLayers
    expect(layers[layers.length - 1]).toMatch(/^…and \d+ more (text nodes|chars) truncated$/)
  })
})
