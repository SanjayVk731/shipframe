import { describe, expect, it } from 'vitest'
import { installFigmaMock } from './figmaMock'

describe('figmaMock annotations', () => {
  it('exposes figma.annotations.categories as an empty array by default', () => {
    installFigmaMock()
    expect((globalThis as any).figma.annotations.categories).toEqual([])
  })

  it('per-node annotations array starts empty and is writable', () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Hello')
    expect(node.annotations).toEqual([])
    node.annotations = [{ label: 'A', categoryId: 'azure' }]
    expect(node.annotations).toEqual([{ label: 'A', categoryId: 'azure' }])
  })

  it('getNodeByIdAsync returns nodes created via makeNode', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Hello')
    const found = await (globalThis as any).figma.getNodeByIdAsync('1:2')
    expect(found).toBe(node)
  })
})
