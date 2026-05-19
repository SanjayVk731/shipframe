import { describe, it, expect } from 'vitest'
import { getProvider, listProviders } from '../../src/providers/registry'

describe('registry', () => {
  it('returns Notion provider by id', () => {
    expect(getProvider('notion').id).toBe('notion')
  })
  it('returns Azure provider by id', () => {
    expect(getProvider('azure').id).toBe('azure')
  })
  it('listProviders returns both with display names', () => {
    const list = listProviders()
    expect(list.map((p) => p.id).sort()).toEqual(['azure', 'notion'])
    expect(list.every((p) => p.displayName.length > 0)).toBe(true)
  })
})
