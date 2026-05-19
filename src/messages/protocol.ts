import type {
  SelectionState,
  TicketLink,
  FileConfig,
  ProviderId,
} from '../shared/types'

export type UiToSandbox =
  | { type: 'get-selection-state'; requestId: string }
  | { type: 'export-thumbnail'; nodeId: string; requestId: string }
  | {
      type: 'write-ticket-link'
      nodeId: string
      link: TicketLink
      requestId: string
    }
  | { type: 'clear-ticket-link'; nodeId: string; requestId: string }
  | { type: 'get-file-config'; requestId: string }
  | { type: 'set-file-config'; config: FileConfig; requestId: string }
  | { type: 'get-pat'; providerId: ProviderId; requestId: string }
  | { type: 'set-pat'; providerId: ProviderId; pat: string; requestId: string }
  | { type: 'focus-node'; nodeId: string; requestId: string }
  | { type: 'open-external'; url: string }

export type SandboxToUi =
  | { type: 'selection-state'; state: SelectionState; requestId: string }
  | {
      type: 'thumbnail'
      nodeId: string
      /** null when the export exceeded the byte cap; `oversized` will be true in that case. */
      image: Uint8Array | null
      oversized: boolean
      requestId: string
    }
  | { type: 'file-config'; config: FileConfig | null; requestId: string }
  | { type: 'pat'; providerId: ProviderId; pat: string | null; requestId: string }
  | { type: 'ack'; requestId: string }
  | { type: 'error'; reason: string; requestId: string }
  | { type: 'selection-changed'; state: SelectionState }

const UI_TYPES = new Set<UiToSandbox['type']>([
  'get-selection-state',
  'export-thumbnail',
  'write-ticket-link',
  'clear-ticket-link',
  'get-file-config',
  'set-file-config',
  'get-pat',
  'set-pat',
  'focus-node',
  'open-external',
])

const SANDBOX_TYPES = new Set<SandboxToUi['type']>([
  'selection-state',
  'thumbnail',
  'file-config',
  'pat',
  'ack',
  'error',
  'selection-changed',
])

export function isUiToSandbox(value: unknown): value is UiToSandbox {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type: unknown }).type === 'string' &&
    UI_TYPES.has((value as { type: UiToSandbox['type'] }).type)
  )
}

export function isSandboxToUi(value: unknown): value is SandboxToUi {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type: unknown }).type === 'string' &&
    SANDBOX_TYPES.has((value as { type: SandboxToUi['type'] }).type)
  )
}
