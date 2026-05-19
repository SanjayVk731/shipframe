import { describe, it, expect, beforeEach } from 'vitest'
import { installFigmaMock } from '../helpers/figmaMock'
import {
  getPat,
  setPat,
  clearPat,
} from '../../src/storage/credentials'

beforeEach(() => {
  installFigmaMock()
})

describe('credentials', () => {
  it('returns null when no PAT set', async () => {
    expect(await getPat('notion')).toBeNull()
  })

  it('round-trips PAT per provider', async () => {
    await setPat('notion', 'secret-n')
    await setPat('azure', 'org|secret-a')
    expect(await getPat('notion')).toBe('secret-n')
    expect(await getPat('azure')).toBe('org|secret-a')
  })

  it('clearPat removes only the given provider', async () => {
    await setPat('notion', 'a')
    await setPat('azure', 'b')
    await clearPat('notion')
    expect(await getPat('notion')).toBeNull()
    expect(await getPat('azure')).toBe('b')
  })
})
