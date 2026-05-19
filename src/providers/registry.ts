import type { TicketProvider } from './types'
import { notionProvider } from './notion'
import { azureProvider } from './azureDevops'
import type { ProviderId } from '../shared/types'

const providers: Record<ProviderId, TicketProvider> = {
  notion: notionProvider,
  azure: azureProvider,
}

export function getProvider(id: ProviderId): TicketProvider {
  return providers[id]
}

export function listProviders(): TicketProvider[] {
  return Object.values(providers)
}
