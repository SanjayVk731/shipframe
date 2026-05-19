import { vi } from 'vitest'

export function installFigmaMock() {
  const store = new Map<string, unknown>()
  const rootData = new Map<string, string>()
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
  }
  ;(globalThis as unknown as { figma: typeof figma }).figma = figma
  return { store, rootData, figma }
}
