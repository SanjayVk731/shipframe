import React, { useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { ErrorBanner } from '../components/ErrorBanner'
import { ThumbnailPreview } from '../components/ThumbnailPreview'
import type {
  FieldSchema,
  ProviderId,
  TicketInput,
} from '../../shared/types'
import type { Result } from '../../providers/types'

interface Props {
  providerId: ProviderId
  boardId: string
  boardLabel: string
  nodeName: string
  thumbnail: Uint8Array | null
  figmaDeepLink: string
  getFieldSchema: (
    providerId: ProviderId,
    boardId: string,
  ) => Promise<Result<FieldSchema>>
  onCreate: (input: TicketInput) => Promise<Result<unknown>>
}

function reasonToMessage(reason: string): string {
  if (reason === 'auth_failed') return "Your token isn't working — re-enter it."
  if (reason === 'not_found') return 'Board not found — re-pick it in settings.'
  if (reason === 'network_error') return 'Network error — check your connection.'
  if (reason === 'rate_limited') return 'Rate limited — wait a moment and retry.'
  if (reason === 'server_error') return 'Server error — try again shortly.'
  return 'Something went wrong.'
}

export function CreateView({
  providerId,
  boardId,
  boardLabel,
  nodeName,
  thumbnail,
  figmaDeepLink,
  getFieldSchema,
  onCreate,
}: Props) {
  const [schema, setSchema] = useState<FieldSchema | null>(null)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [title, setTitle] = useState(nodeName)
  const [description, setDescription] = useState('')
  const [type, setType] = useState('')
  const [priority, setPriority] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [labelIds, setLabelIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

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

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    const input: TicketInput = {
      title: title.trim(),
      description,
      type: type || null,
      priority: priority || null,
      assigneeId: assigneeId || null,
      labelIds,
      figmaDeepLink,
    }
    const r = await onCreate(input)
    setSubmitting(false)
    if (!r.ok) setSubmitError(reasonToMessage(r.reason))
  }

  return (
    <div>
      <h2>Create ticket</h2>
      <p style={{ marginTop: -4, opacity: 0.7 }}>Destination: {boardLabel}</p>

      <ThumbnailPreview image={thumbnail} alt={nodeName} />

      {schemaError && <ErrorBanner message={schemaError} />}
      {submitError && <ErrorBanner message={submitError} onRetry={submit} />}

      <Input label="Title" value={title} onChange={setTitle} />
      <Input label="Description" value={description} onChange={setDescription} multiline />

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
