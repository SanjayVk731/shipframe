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

  it('round-trips an azure-openai config with endpoint', async () => {
    const endpoint =
      'https://mycorp.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21'
    await setAiConfig({ provider: 'azure-openai', key: 'k', endpoint })
    expect(await getAiConfig()).toEqual({
      provider: 'azure-openai',
      key: 'k',
      endpoint,
    })
  })

  it('returns undefined when azure-openai endpoint is missing', async () => {
    const { figma } = installFigmaMock()
    await figma.clientStorage.setAsync('ai:provider', 'azure-openai')
    await figma.clientStorage.setAsync('ai:key', 'k')
    // No ai:endpoint stored.
    expect(await getAiConfig()).toBeUndefined()
  })

  it('returns undefined when azure-openai endpoint is not on openai.azure.com', async () => {
    const { figma } = installFigmaMock()
    await figma.clientStorage.setAsync('ai:provider', 'azure-openai')
    await figma.clientStorage.setAsync('ai:key', 'k')
    await figma.clientStorage.setAsync(
      'ai:endpoint',
      'https://evil.example.com/openai/deployments/x/chat/completions',
    )
    expect(await getAiConfig()).toBeUndefined()
  })

  it('returns undefined when azure-openai endpoint is http (not https)', async () => {
    const { figma } = installFigmaMock()
    await figma.clientStorage.setAsync('ai:provider', 'azure-openai')
    await figma.clientStorage.setAsync('ai:key', 'k')
    await figma.clientStorage.setAsync(
      'ai:endpoint',
      'http://mycorp.openai.azure.com/openai/deployments/x/chat/completions',
    )
    expect(await getAiConfig()).toBeUndefined()
  })

  it('clear removes endpoint too', async () => {
    const { figma } = installFigmaMock()
    await setAiConfig({
      provider: 'azure-openai',
      key: 'k',
      endpoint:
        'https://mycorp.openai.azure.com/openai/deployments/d/chat/completions?api-version=2024-10-21',
    })
    await clearAiConfig()
    expect(await figma.clientStorage.getAsync('ai:endpoint')).toBeUndefined()
    expect(await getAiConfig()).toBeUndefined()
  })

  it('switching from azure-openai to anthropic clears the stale endpoint', async () => {
    const { figma } = installFigmaMock()
    await setAiConfig({
      provider: 'azure-openai',
      key: 'k1',
      endpoint:
        'https://mycorp.openai.azure.com/openai/deployments/d/chat/completions?api-version=2024-10-21',
    })
    await setAiConfig({ provider: 'anthropic', key: 'k2' })
    expect(await figma.clientStorage.getAsync('ai:endpoint')).toBeUndefined()
    expect(await getAiConfig()).toEqual({ provider: 'anthropic', key: 'k2' })
  })

  it('clearAiConfig also wipes the legacy ai:model key (defensive)', async () => {
    const { figma } = installFigmaMock()
    // Simulate a leftover write from the never-shipped Ollama provider.
    await figma.clientStorage.setAsync('ai:model', 'gpt-oss-20b')
    await clearAiConfig()
    expect(await figma.clientStorage.getAsync('ai:model')).toBeUndefined()
  })
})
