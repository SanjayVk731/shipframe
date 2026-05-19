import { describe, expect, it } from 'vitest'
import { collectFrameContext, FRAME_CONTEXT_LIMITS } from '../../src/sandbox/frameContext'
import { installFigmaMock, type MockNode } from '../helpers/figmaMock'

function text(id: string, characters: string, visible = true): MockNode {
  return {
    id,
    type: 'TEXT',
    name: 'text',
    children: [],
    characters,
    visible,
    annotations: [],
  }
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
        return {
          id: `f:${d}`,
          type: 'FRAME',
          name: `f${d}`,
          children: [child],
          visible: true,
          annotations: [],
        }
      }
      return {
        id: `f:${d}`,
        type: 'FRAME',
        name: `f${d}`,
        children: [child, deepChild(d + 1)],
        visible: true,
        annotations: [],
      }
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
})
