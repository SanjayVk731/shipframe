import React, { useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { ErrorBanner } from '../components/ErrorBanner'
import { ThumbnailPreview } from '../components/ThumbnailPreview'
import { ViewHeader } from '../components/ViewHeader'
import { composeDescription } from '../composeDescription'
import type {
  FieldSchema,
  ProviderId,
  TicketInput,
  FrameContext,
} from '../../shared/types'
import type { Result } from '../../providers/types'

type SectionSet = 'bug' | 'story' | 'task'

function sectionSetFor(workItemType: string | undefined): SectionSet {
  if (workItemType === 'Bug') return 'bug'
  if (workItemType === 'Task' || workItemType === 'Epic') return 'task'
  // User Story, Feature, anything custom → story set (AC + out of scope)
  return 'story'
}

interface Props {
  providerId: ProviderId
  boardId: string
  boardLabel: string
  nodeName: string
  thumbnail: Uint8Array | null
  /** Set when the section/frame exceeded the byte cap and no thumbnail will be attached. */
  thumbnailOversized?: boolean
  /** Azure work item type ("Bug", "User Story", etc.) — drives which structured sections render. */
  workItemType?: string
  figmaDeepLink: string
  /** Label used when rendering the prominent "Figma:" link in description (usually the frame name). */
  figmaLinkLabel?: string
  getFieldSchema: (
    providerId: ProviderId,
    boardId: string,
  ) => Promise<Result<FieldSchema>>
  onCreate: (input: TicketInput) => Promise<Result<unknown>>
  onOpenSettings?: () => void
  /** AI Draft configuration. When undefined, the Draft button is hidden. */
  aiConfig?: import('../../storage/aiConfig').AiConfig
  /** Counts from the selection — used to gate the Draft button. */
  annotationsCount?: number
  textLayersCount?: number
  /**
   * Fetches frame context from the sandbox. Returns the context or undefined
   * if the sandbox couldn't read it.
   */
  getFrameContext?: () => Promise<FrameContext | undefined>
}

function reasonToMessage(reason: string): string {
  if (reason === 'auth_failed') return "Your token isn't working — re-enter it."
  if (reason === 'not_found') return 'Board not found — re-pick it in settings.'
  if (reason === 'network_error') return 'Network error — check your connection.'
  if (reason === 'rate_limited') return 'Rate limited — wait a moment and retry.'
  if (reason === 'server_error') return 'Server error — try again shortly.'
  return 'Something went wrong.'
}

function draftReasonToMessage(reason: string): string {
  if (reason === 'auth_failed') return 'Invalid API key — check Settings.'
  if (reason === 'rate_limited') return 'Rate limited — try again in a moment.'
  if (reason === 'server_error') return 'AI provider is having issues — try again.'
  if (reason === 'network_error') return "Couldn't reach the AI provider."
  return 'AI draft failed — try again.'
}

/**
 * Pulls a human-readable line out of a provider's error body. Both Azure DevOps
 * (`{ message, typeKey }`) and Notion (`{ code, message }`) return JSON with a
 * `message` field. Falls back to the raw detail string when parsing fails.
 */
function extractProviderDetail(detail: string | undefined): string | null {
  if (!detail) return null
  try {
    const parsed = JSON.parse(detail) as { message?: unknown }
    if (typeof parsed.message === 'string' && parsed.message.length > 0) {
      return parsed.message
    }
  } catch {
    // not JSON — fall through
  }
  const trimmed = detail.trim()
  return trimmed.length > 0 && trimmed.length < 500 ? trimmed : null
}

function errorToMessage(r: {
  reason: string
  detail?: string | undefined
}): string {
  const detail = extractProviderDetail(r.detail)
  if (detail) return detail
  return reasonToMessage(r.reason)
}

export function CreateView({
  providerId,
  boardId,
  boardLabel,
  nodeName,
  thumbnail,
  thumbnailOversized = false,
  workItemType,
  figmaDeepLink,
  figmaLinkLabel,
  getFieldSchema,
  onCreate,
  onOpenSettings,
  aiConfig,
  annotationsCount,
  textLayersCount,
  getFrameContext,
}: Props) {
  const [schema, setSchema] = useState<FieldSchema | null>(null)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [title, setTitle] = useState(nodeName)
  const [description, setDescription] = useState('')
  const [type, setType] = useState('')
  const [priority, setPriority] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [labelIds, setLabelIds] = useState<string[]>([])
  const [reproSteps, setReproSteps] = useState('')
  const [expected, setExpected] = useState('')
  const [actual, setActual] = useState('')
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('')
  const [outOfScope, setOutOfScope] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  const sectionSet = sectionSetFor(workItemType)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const r = await getFieldSchema(providerId, boardId)
      if (cancelled) return
      if (r.ok) setSchema(r.value)
      else setSchemaError(reasonToMessage(r.reason))
    })()
    return () => {
      cancelled = true
    }
  }, [providerId, boardId, getFieldSchema])

  const canSubmit = title.trim().length > 0 && schema !== null && !submitting

  const canDraft =
    aiConfig !== undefined &&
    ((annotationsCount ?? 0) > 0 || (textLayersCount ?? 0) > 0) &&
    !drafting &&
    !submitting

  async function onDraft() {
    if (!aiConfig || !getFrameContext) return
    setDrafting(true)
    setDraftError(null)
    try {
      const ctx = await getFrameContext()
      if (!ctx) {
        setDraftError("Couldn't read the frame.")
        return
      }
      if (ctx.annotations.length === 0 && ctx.textLayers.length === 0) {
        setDraftError('Nothing to draft from — add a Figma annotation or text layer first.')
        return
      }
      // Static import would be fine — the singlefile build inlines everything
      // anyway. We keep the dynamic import for clean separation: AI code only
      // runs in the iframe when this handler is actually invoked.
      const { draftFromContext } = await import('../ai/draft')
      const drafted = await draftFromContext(ctx, aiConfig)
      if (!drafted.ok) {
        setDraftError(draftReasonToMessage(drafted.reason))
        return
      }
      const v = drafted.value
      if (typeof v.title === 'string') setTitle(v.title)
      if (typeof v.main === 'string') setDescription(v.main)
      if (typeof v.reproSteps === 'string') setReproSteps(v.reproSteps)
      if (typeof v.expected === 'string') setExpected(v.expected)
      if (typeof v.actual === 'string') setActual(v.actual)
      if (typeof v.acceptanceCriteria === 'string') setAcceptanceCriteria(v.acceptanceCriteria)
      if (typeof v.outOfScope === 'string') setOutOfScope(v.outOfScope)
    } finally {
      setDrafting(false)
    }
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    const composed = composeDescription({
      main: description,
      reproSteps: sectionSet === 'bug' ? reproSteps : '',
      expected: sectionSet === 'bug' ? expected : '',
      actual: sectionSet === 'bug' ? actual : '',
      acceptanceCriteria:
        sectionSet === 'story' || sectionSet === 'task' ? acceptanceCriteria : '',
      outOfScope: sectionSet === 'story' ? outOfScope : '',
      figmaLink: {
        url: figmaDeepLink,
        label: figmaLinkLabel ?? 'Open in Figma',
      },
    })
    const input: TicketInput = {
      title: title.trim(),
      description: composed.description,
      type: type || null,
      priority: priority || null,
      assigneeId: assigneeId || null,
      labelIds,
      figmaDeepLink,
      acceptanceCriteriaHtml: composed.acceptanceCriteriaHtml,
      reproStepsHtml: composed.reproStepsHtml,
    }
    const r = await onCreate(input)
    setSubmitting(false)
    if (!r.ok) setSubmitError(errorToMessage(r))
  }

  return (
    <div>
      <ViewHeader title="Create ticket" onOpenSettings={onOpenSettings} />
      <p style={{ marginTop: -4, opacity: 0.7 }}>Destination: {boardLabel}</p>

      <ThumbnailPreview image={thumbnail} alt={nodeName} />

      {thumbnailOversized && (
        <div className="warning-banner" role="status">
          This selection is too large to attach as an image. The ticket will be
          created with the Figma link only.
        </div>
      )}

      {aiConfig && (
        <div style={{ marginBottom: 12 }}>
          <Button
            variant="primary"
            disabled={!canDraft}
            onClick={() => void onDraft()}
          >
            {drafting ? '✨ Drafting…' : '✨ Draft with AI'}
          </Button>
          {draftError && (
            <p style={{ marginTop: 6, marginBottom: 0, opacity: 0.85, fontSize: 12 }}>
              {draftError}
            </p>
          )}
          {!draftError && !drafting && annotationsCount === 0 && textLayersCount === 0 && (
            <p style={{ marginTop: 6, marginBottom: 0, opacity: 0.6, fontSize: 12 }}>
              Add a Figma annotation or text layer to enable AI Draft.
            </p>
          )}
        </div>
      )}

      {schemaError && <ErrorBanner message={schemaError} />}
      {submitError && <ErrorBanner message={submitError} onRetry={submit} />}

      <Input label="Title" value={title} onChange={setTitle} />
      <Input label="Description" value={description} onChange={setDescription} multiline />
      <p style={{ marginTop: -4, marginBottom: 8, fontSize: 11, opacity: 0.6 }}>
        Markdown supported: **bold**, *italic*, `code`, [links](url), - lists.
      </p>

      {sectionSet === 'bug' && (
        <>
          <Input
            label="Reproduction steps"
            value={reproSteps}
            onChange={setReproSteps}
            placeholder="one per line"
            multiline
          />
          <Input
            label="Expected behavior"
            value={expected}
            onChange={setExpected}
            multiline
          />
          <Input
            label="Actual behavior"
            value={actual}
            onChange={setActual}
            multiline
          />
        </>
      )}
      {(sectionSet === 'story' || sectionSet === 'task') && (
        <Input
          label="Acceptance criteria"
          value={acceptanceCriteria}
          onChange={setAcceptanceCriteria}
          placeholder="one per line"
          multiline
        />
      )}
      {sectionSet === 'story' && (
        <Input
          label="Out of scope"
          value={outOfScope}
          onChange={setOutOfScope}
          multiline
        />
      )}

      {schema && schema.types.length > 0 && (
        <div className="field">
          <label htmlFor="type">Type</label>
          <select id="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">—</option>
            {schema.types.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {schema && schema.priorities.length > 0 && (
        <div className="field">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">—</option>
            {schema.priorities.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {schema && schema.assignees.length > 0 && (
        <div className="field">
          <label htmlFor="assignee">Assignee</label>
          <select
            id="assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">—</option>
            {schema.assignees.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {schema && schema.labels.length > 0 && (
        <div className="field">
          <label htmlFor="labels">Labels</label>
          <select
            id="labels"
            multiple
            value={labelIds}
            onChange={(e) =>
              setLabelIds(Array.from(e.target.selectedOptions).map((o) => o.value))
            }
          >
            {schema.labels.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <Button variant="primary" disabled={!canSubmit} onClick={submit}>
        {submitting ? 'Creating…' : 'Create ticket'}
      </Button>
    </div>
  )
}
