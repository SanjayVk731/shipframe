import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  readLink,
  writeLink,
  clearLink,
} from '../../src/sandbox/nodeLink'

function makeNode(): SceneNode {
  const map = new Map<string, string>()
  return {
    getPluginData: vi.fn((k: string) => map.get(k) ?? ''),
    setPluginData: vi.fn((k: string, v: string) => {
      map.set(k, v)
    }),
  } as unknown as SceneNode
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('nodeLink', () => {
  it('readLink returns null when empty', () => {
    expect(readLink(makeNode())).toBeNull()
  })

  it('writeLink then readLink round-trips', () => {
    const n = makeNode()
    const link = {
      id: 'AZ-1',
      url: 'https://x',
      providerId: 'azure' as const,
      createdAt: '2026-05-19T00:00:00Z',
    }
    writeLink(n, link)
    expect(readLink(n)).toEqual(link)
  })

  it('readLink returns null when stored value is malformed', () => {
    const n = makeNode()
    n.setPluginData('ticketLink', 'not json')
    expect(readLink(n)).toBeNull()
  })

  it('clearLink wipes the data', () => {
    const n = makeNode()
    writeLink(n, {
      id: '1',
      url: 'u',
      providerId: 'notion',
      createdAt: 'x',
    })
    clearLink(n)
    expect(readLink(n)).toBeNull()
  })
})
