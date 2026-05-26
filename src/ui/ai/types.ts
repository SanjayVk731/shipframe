import type { AiProvider } from '../../storage/aiConfig'

export type { AiProvider }

export interface DraftOutput {
  title?: string
  main?: string
  reproSteps?: string
  expected?: string
  actual?: string
  acceptanceCriteria?: string
  outOfScope?: string
  pinMarkdown?: string
}

export const DRAFT_KEYS: Array<keyof DraftOutput> = [
  'title',
  'main',
  'reproSteps',
  'expected',
  'actual',
  'acceptanceCriteria',
  'outOfScope',
  'pinMarkdown',
]

export const PIN_MARKDOWN_MAX = 280
