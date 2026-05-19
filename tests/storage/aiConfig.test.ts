import { beforeEach, describe, expect, it } from 'vitest'
import {
  getAiConfig,
  setAiConfig,
  clearAiConfig,
} from '../../src/storage/aiConfig'
import { installFigmaMock } from '../helpers/figmaMock'

describe('aiConfig', () => {
  beforeEach(() => {
    installFigmaMock()
  })

  it('returns undefined when nothing is stored', async () => {
    expect(await getAiConfig()).toBeUndefined()
  })

  it('returns undefined when provider stored but key missing', async () => {
    const { figma } = installFigmaMock()
    await figma.clientStorage.setAsync('ai:provider', 'anthropic')
    expect(await getAiConfig()).toBeUndefined()
  })

  it('returns undefined when key stored but provider missing', async () => {
    const { figma } = installFigmaMock()
    await figma.clientStorage.setAsync('ai:key', 'sk-xyz')
    expect(await getAiConfig()).toBeUndefined()
  })

  it('round-trips an anthropic config', async () => {
    await setAiConfig({ provider: 'anthropic', key: 'sk-ant-xyz' })
    expect(await getAiConfig()).toEqual({ provider: 'anthropic', key: 'sk-ant-xyz' })
  })

  it('round-trips an openai config', async () => {
    await setAiConfig({ provider: 'openai', key: 'sk-oai-xyz' })
    expect(await getAiConfig()).toEqual({ provider: 'openai', key: 'sk-oai-xyz' })
  })

  it('clear removes both keys atomically', async () => {
    await setAiConfig({ provider: 'anthropic', key: 'k' })
    await clearAiConfig()
    expect(await getAiConfig()).toBeUndefined()
  })

  it('rejects invalid provider on read (defensive)', async () => {
    const { figma } = installFigmaMock()
    await figma.clientStorage.setAsync('ai:provider', 'wat')
    await figma.clientStorage.setAsync('ai:key', 'k')
    expect(await getAiConfig()).toBeUndefined()
  })

  it('rejects empty key on read', async () => {
    const { figma } = installFigmaMock()
    await figma.clientStorage.setAsync('ai:provider', 'anthropic')
    await figma.clientStorage.setAsync('ai:key', '')
    expect(await getAiConfig()).toBeUndefined()
  })
})
