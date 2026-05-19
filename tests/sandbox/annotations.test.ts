import { describe, expect, it } from 'vitest'
import { isOursLabel } from '../../src/sandbox/annotations'

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
