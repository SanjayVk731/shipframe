import { describe, expect, it } from 'vitest'
import { isOursLabel, buildLabel } from '../../src/sandbox/annotations'

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
