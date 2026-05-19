import { describe, expect, it } from 'vitest'
import {
  buildSystemPrompt,
  buildUserPrompt,
} from '../../../src/ui/ai/prompt'
import type { FrameContext } from '../../../src/shared/types'

describe('buildSystemPrompt', () => {
  it('mentions returning JSON and the allowed keys', () => {
    const sys = buildSystemPrompt()
    expect(sys).toContain('JSON')
    for (const key of [
      'title',
      'main',
      'reproSteps',
      'expected',
      'actual',
      'acceptanceCriteria',
      'outOfScope',
    ]) {
      expect(sys).toContain(key)
    }
  })

  it('is deterministic (no timestamps/randomness)', () => {
    expect(buildSystemPrompt()).toBe(buildSystemPrompt())
  })
})

describe('buildUserPrompt', () => {
  const ctx: FrameContext = {
    frameName: 'Login — error',
    workItemType: 'Bug',
    annotations: ['Submit button does not disable', 'Toast disappears too fast'],
    textLayers: ['Sign in', 'Email', 'Password', 'Something went wrong'],
  }

  it('includes frame name, WIT, annotations and text layers', () => {
    const out = buildUserPrompt(ctx)
    expect(out).toContain('Login — error')
    expect(out).toContain('Bug')
    expect(out).toContain('Submit button does not disable')
    expect(out).toContain('Something went wrong')
  })

  it('marks unknown WIT as "User Story" fallback', () => {
    const out = buildUserPrompt({ ...ctx, workItemType: undefined })
    expect(out).toContain('User Story')
  })

  it('handles empty arrays without throwing', () => {
    const out = buildUserPrompt({
      frameName: 'Empty',
      workItemType: undefined,
      annotations: [],
      textLayers: [],
    })
    expect(typeof out).toBe('string')
  })

  it('is deterministic for identical input', () => {
    const a = buildUserPrompt(ctx)
    const b = buildUserPrompt(ctx)
    expect(a).toBe(b)
  })
})
