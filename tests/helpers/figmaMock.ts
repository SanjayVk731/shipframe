import { vi } from 'vitest'

export interface MockAnnotation {
  label?: string
  labelMarkdown?: string
  categoryId?: string
}

export interface MockNode {
  id: string
  type: string
  name: string
  children: MockNode[]
  characters?: string
  visible: boolean
  // Undefined for node types that don't implement AnnotationsMixin (e.g. SECTION).
  annotations?: MockAnnotation[]
  pluginData: Map<string, string>
  getPluginData: (k: string) => string
  setPluginData: (k: string, v: string) => void
}

export function installFigmaMock() {
  const store = new Map<string, unknown>()
  const rootData = new Map<string, string>()
  const nodes = new Map<string, MockNode>()

  function makeNode(
    id: string,
    type: string,
    name: string,
    opts: {
      characters?: string
      visible?: boolean
      children?: MockNode[]
      // Pass false to simulate node types that don't implement AnnotationsMixin
      // (SECTION, etc.). Default true matches FRAME/COMPONENT/INSTANCE.
      supportsAnnotations?: boolean
    } = {},
  ): MockNode {
    const pluginData = new Map<string, string>()
    const node: MockNode = {
      id,
      type,
      name,
      children: opts.children ?? [],
      characters: opts.characters,
      visible: opts.visible ?? true,
      annotations: opts.supportsAnnotations === false ? undefined : [],
      pluginData,
      getPluginData: (k: string) => pluginData.get(k) ?? '',
      setPluginData: (k: string, v: string) => {
        if (v === '') pluginData.delete(k)
        else pluginData.set(k, v)
      },
    }
    nodes.set(id, node)
    return node
  }

  const figma = {
    clientStorage: {
      getAsync: vi.fn(async (k: string) => store.get(k) ?? undefined),
      setAsync: vi.fn(async (k: string, v: unknown) => {
        store.set(k, v)
      }),
      deleteAsync: vi.fn(async (k: string) => {
        store.delete(k)
      }),
    },
    root: {
      getPluginData: vi.fn((k: string) => rootData.get(k) ?? ''),
      setPluginData: vi.fn((k: string, v: string) => {
        rootData.set(k, v)
      }),
    },
    annotations: {
      categories: [] as Array<{ id: string; label: string; color: string }>,
    },
    getNodeByIdAsync: vi.fn(async (id: string) => nodes.get(id) ?? null),
  }
  ;(globalThis as unknown as { figma: typeof figma }).figma = figma
  return { store, rootData, nodes, figma, makeNode }
}
