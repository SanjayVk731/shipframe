import { describe, it, expect, beforeEach } from 'vitest'
import { installFigmaMock } from '../helpers/figmaMock'
import {
  getFileConfig,
  setFileConfig,
  clearFileConfig,
} from '../../src/storage/fileConfig'

beforeEach(() => {
  installFigmaMock()
})

describe('fileConfig', () => {
  it('returns null when nothing stored', () => {
    expect(getFileConfig()).toBeNull()
  })

  it('round-trips config', () => {
    setFileConfig({ providerId: 'azure', boardId: 'o|p|t|Bug', boardLabel: 'P / T / Bug' })
    expect(getFileConfig()).toEqual({
      providerId: 'azure',
      boardId: 'o|p|t|Bug',
      boardLabel: 'P / T / Bug',
    })
  })

  it('returns null on malformed stored value', () => {
    figma.root.setPluginData('fileConfig', 'not json')
    expect(getFileConfig()).toBeNull()
  })

  it('clearFileConfig wipes it', () => {
    setFileConfig({ providerId: 'notion', boardId: 'db-1', boardLabel: 'Bugs' })
    clearFileConfig()
    expect(getFileConfig()).toBeNull()
  })

  it('returns null when stored JSON has wrong shape', () => {
    figma.root.setPluginData('fileConfig', JSON.stringify({ providerId: 'jira', boardId: 'x', boardLabel: 'y' }))
    expect(getFileConfig()).toBeNull()
  })
})
