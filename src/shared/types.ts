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
  /**
   * The Figma file key parsed from the file's URL. Required because
   * `figma.fileKey` is gated to private plugins and returns null in the
   * Community/public plugin runtime, so we ask the user to paste the URL once.
   */
  fileKey: string
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
      annotationsCount: number
      textLayersCount: number
    }

export interface TicketInput {
  title: string
  description: string
  type: string | null
  priority: string | null
  assigneeId: string | null
  labelIds: string[]
  figmaDeepLink: string
  /**
   * Pre-composed HTML for Azure's Microsoft.VSTS.Common.AcceptanceCriteria field.
   * Empty string when no AC was provided. Notion ignores this today.
   */
  acceptanceCriteriaHtml?: string
  /**
   * Pre-composed HTML for Azure's Microsoft.VSTS.TCM.ReproSteps field.
   * Empty string when no repro steps were provided. Notion ignores this today.
   */
  reproStepsHtml?: string
}

export interface FrameContext {
  frameName: string
  workItemType: string | undefined
  /** Native Figma annotation labels on the frame. */
  annotations: string[]
  /** Visible TEXT.characters from descendants, bounded — see frameContext.ts. */
  textLayers: string[]
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
