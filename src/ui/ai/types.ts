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
}

export const DRAFT_KEYS: Array<keyof DraftOutput> = [
  'title',
  'main',
  'reproSteps',
  'expected',
  'actual',
  'acceptanceCriteria',
  'outOfScope',
]
