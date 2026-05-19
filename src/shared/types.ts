export type ProviderId = 'notion' | 'azure'

export interface TicketLink {
  id: string
  url: string
  providerId: ProviderId
  createdAt: string
}

export interface FileConfig {
  providerId: ProviderId
  boardId: string
  boardLabel: string
}

export type SelectionState =
  | { kind: 'none' }
  | { kind: 'multi' }
  | { kind: 'unsupported' }
  | {
      kind: 'single'
      nodeId: string
      nodeName: string
      link: TicketLink | null
    }

export interface TicketInput {
  title: string
  description: string
  type: string | null
  priority: string | null
  assigneeId: string | null
  labelIds: string[]
  figmaDeepLink: string
}

export interface Board {
  id: string
  label: string
  meta?: Record<string, string>
}

export interface FieldOption {
  id: string
  label: string
}

export interface FieldSchema {
  types: FieldOption[]
  priorities: FieldOption[]
  assignees: FieldOption[]
  labels: FieldOption[]
}
