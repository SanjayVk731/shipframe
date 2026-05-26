import { describe, expect, it } from 'vitest'
import { parseDraftResponse } from '../../../src/ui/ai/parseResponse'

describe('parseDraftResponse', () => {
  it('returns ok for a valid JSON with all keys', () => {
    const raw = JSON.stringify({
      title: 'T',
      main: 'M',
      reproSteps: 'R',
      expected: 'E',
      actual: 'A',
      acceptanceCriteria: 'AC',
      outOfScope: 'OOS',
    })
    const r = parseDraftResponse(raw, 'Bug')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Bug → main + reproSteps + expected + actual ; AC + outOfScope dropped
    expect(r.value).toEqual({
      title: 'T',
      main: 'M',
      reproSteps: 'R',
      expected: 'E',
      actual: 'A',
    })
  })

  it('keeps acceptanceCriteria + outOfScope for User Story', () => {
    const raw = JSON.stringify({ title: 'T', main: 'M', acceptanceCriteria: 'AC', outOfScope: 'OOS' })
    const r = parseDraftResponse(raw, 'User Story')
    expect(r.ok && r.value).toEqual({
      title: 'T',
      main: 'M',
      acceptanceCriteria: 'AC',
      outOfScope: 'OOS',
    })
  })

  it('keeps only acceptanceCriteria for Task / Epic', () => {
    const raw = JSON.stringify({ title: 'T', main: 'M', acceptanceCriteria: 'AC', outOfScope: 'OOS', reproSteps: 'R' })
    const taskR = parseDraftResponse(raw, 'Task')
    expect(taskR.ok && taskR.value).toEqual({ title: 'T', main: 'M', acceptanceCriteria: 'AC' })
    const epicR = parseDraftResponse(raw, 'Epic')
    expect(epicR.ok && epicR.value).toEqual({ title: 'T', main: 'M', acceptanceCriteria: 'AC' })
  })

  it('treats unknown WIT as User Story', () => {
    const raw = JSON.stringify({ acceptanceCriteria: 'AC', outOfScope: 'OOS' })
    const r = parseDraftResponse(raw, undefined)
    expect(r.ok && r.value).toEqual({ acceptanceCriteria: 'AC', outOfScope: 'OOS' })
  })

  it('strips JSON fences from response', () => {
    const raw = '```json\n{"title":"T"}\n```'
    const r = parseDraftResponse(raw, 'Bug')
    expect(r.ok && r.value).toEqual({ title: 'T' })
  })

  it('ignores extra unknown keys', () => {
    const raw = JSON.stringify({ title: 'T', extra: 'ignored', other: 1 })
    const r = parseDraftResponse(raw, 'Bug')
    expect(r.ok && r.value).toEqual({ title: 'T' })
  })

  it('returns ok:false when JSON is unparseable', () => {
    const r = parseDraftResponse('not json', 'Bug')
    expect(r).toEqual({ ok: false, reason: 'malformed' })
  })

  it('returns ok:false when JSON is not an object', () => {
    const r = parseDraftResponse('"a string"', 'Bug')
    expect(r).toEqual({ ok: false, reason: 'malformed' })
    const r2 = parseDraftResponse('[1,2,3]', 'Bug')
    expect(r2).toEqual({ ok: false, reason: 'malformed' })
  })

  it('coerces non-string values to strings if reasonable, else drops', () => {
    const raw = JSON.stringify({ title: 'T', main: null, reproSteps: 42 })
    const r = parseDraftResponse(raw, 'Bug')
    expect(r.ok && r.value).toEqual({ title: 'T', reproSteps: '42' })
  })
})

describe('parseDraftResponse pinMarkdown', () => {
  it('preserves pinMarkdown regardless of WIT', () => {
    const raw = JSON.stringify({ title: 'T', main: 'M', pinMarkdown: 'pin' })
    for (const wit of ['Bug', 'User Story', 'Task', 'Feature', 'Epic', undefined]) {
      const r = parseDraftResponse(raw, wit)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.pinMarkdown).toBe('pin')
    }
  })

  it('truncates pinMarkdown at 280 chars with ellipsis', () => {
    const long = 'x'.repeat(500)
    const r = parseDraftResponse(JSON.stringify({ pinMarkdown: long }), 'Bug')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.pinMarkdown).toBeDefined()
      expect(r.value.pinMarkdown!.length).toBe(280)
      expect(r.value.pinMarkdown!.endsWith('…')).toBe(true)
    }
  })

  it('omits pinMarkdown when absent', () => {
    const r = parseDraftResponse(JSON.stringify({ title: 'T' }), 'Bug')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.pinMarkdown).toBeUndefined()
  })
})
