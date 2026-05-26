import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { TicketInput, SelectionState, TicketLink } from '../../src/shared/types'
import type { Result } from '../../src/providers/types'

// --- Mocks -----------------------------------------------------------------
// We exercise App's onCreate orchestration directly: mock CreateView to capture
// the onCreate prop, mock the sandbox to record requests, and mock the provider
// registry to control createTicket / uploadAttachment outcomes.

// vi.mock factories are hoisted above the module body, so any spies they close
// over must be created via vi.hoisted (otherwise they're in the TDZ at factory
// eval time and read as undefined).
const h = vi.hoisted(() => ({
  createTicket: vi.fn(),
  uploadAttachment: vi.fn(),
  capture: {
    onCreate: null as null | ((input: TicketInput) => Promise<Result<unknown>>),
    thumbnail: null as Uint8Array | null,
    thumbnailOversized: false as boolean,
  },
}))

vi.mock('../../src/ui/views/CreateView', () => ({
  CreateView: (props: {
    onCreate: (input: TicketInput) => Promise<Result<unknown>>
    thumbnail: Uint8Array | null
    thumbnailOversized?: boolean
  }) => {
    h.capture.onCreate = props.onCreate
    h.capture.thumbnail = props.thumbnail
    h.capture.thumbnailOversized = props.thumbnailOversized ?? false
    return null
  },
}))
vi.mock('../../src/ui/views/LinkedView', () => ({ LinkedView: () => null }))
vi.mock('../../src/ui/views/SettingsView', () => ({ SettingsView: () => null }))

// Sandbox request mock — resolves per message type. Tests can inspect calls.
const sandboxRequest = vi.fn(async (msg: { type: string }) => defaultReplies(msg))
let selection: SelectionState = { kind: 'none' }

function defaultReplies(msg: { type: string }): unknown {
  switch (msg.type) {
    case 'get-file-config':
      return {
        type: 'file-config',
        config: {
          providerId: 'azure',
          boardId: 'org|proj|Bug',
          boardLabel: 'Bugs',
          fileKey: 'ABC123',
        },
      }
    case 'get-pat':
      return { type: 'pat', pat: 'org|tok' }
    case 'get-ai-config':
      return { type: 'ai-config', config: null }
    case 'write-ticket-link':
      return { type: 'ack', requestId: '' }
    case 'append-ticket-id-to-annotation':
    case 'sync-annotation':
      return { type: 'ack', requestId: '' }
    case 'get-selection-state':
      return { type: 'selection-state', state: selection }
    case 'export-thumbnail':
      return { type: 'thumbnail', image: null, oversized: false }
    default:
      return { type: 'ack', requestId: '' }
  }
}

// The real useSandbox returns a stable object identity across renders that
// don't change selection (request is useCallback'd). We must mirror that: a
// fresh object every render would make App's selection effect (which depends on
// `sandbox`) re-fire on every render and loop forever. Cache by selection ref.
let cachedSandbox: { selection: SelectionState; request: typeof sandboxRequest } | null = null
vi.mock('../../src/ui/hooks/useSandbox', () => ({
  useSandbox: () => {
    if (!cachedSandbox || cachedSandbox.selection !== selection) {
      cachedSandbox = { selection, request: sandboxRequest }
    }
    return cachedSandbox
  },
}))

const { createTicket, uploadAttachment } = h
vi.mock('../../src/providers/registry', () => ({
  getProvider: () => ({ createTicket: h.createTicket, uploadAttachment: h.uploadAttachment }),
}))

import { App } from '../../src/ui/App'

function singleSelection(overrides: Partial<Extract<SelectionState, { kind: 'single' }>> = {}) {
  return {
    kind: 'single' as const,
    nodeId: '1:1',
    nodeName: 'Hero',
    link: null,
    annotationsCount: 0,
    textLayersCount: 0,
    hasDraftPin: false,
    ...overrides,
  }
}

const okTicket = (extra: Record<string, unknown> = {}): Result<unknown> => ({
  ok: true,
  status: 200,
  value: { id: '42', url: 'https://dev.azure.com/wi/42', ...extra },
})

async function renderAndGetOnCreate() {
  render(<App />)
  await waitFor(() => expect(h.capture.onCreate).not.toBeNull())
  return h.capture.onCreate!
}

// After mount, the export-thumbnail effect resolves async and calls setThumb,
// re-rendering CreateView with a new onCreate that closes over the thumbnail.
// Wait until the thumbnail prop is actually reflected.
async function waitForThumbnail() {
  await waitFor(() => expect(h.capture.thumbnail).not.toBeNull())
}

const baseInput: TicketInput = {
  title: 'Bug title',
  description: '<p>desc</p>',
  type: null,
  priority: null,
  assigneeId: null,
  labelIds: [],
  figmaDeepLink: 'https://figma.com/x',
}

beforeEach(() => {
  sandboxRequest.mockClear()
  sandboxRequest.mockImplementation(async (msg: { type: string }) => defaultReplies(msg))
  createTicket.mockReset()
  uploadAttachment.mockReset()
  h.capture.onCreate = null
  h.capture.thumbnail = null
  cachedSandbox = null
  selection = singleSelection()
})

describe('App.onCreate — thumbnail inlining', () => {
  it('inlines the thumbnail when present and not oversized; skips uploadAttachment', async () => {
    selection = singleSelection()
    // export-thumbnail returns bytes so the effect populates `thumb`.
    sandboxRequest.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'export-thumbnail') {
        return { type: 'thumbnail', image: new Uint8Array([1, 2, 3]), oversized: false }
      }
      return defaultReplies(msg)
    })
    createTicket.mockResolvedValue(okTicket({ inlineImageAttached: true }))

    await renderAndGetOnCreate()
    // Wait for the export-thumbnail effect to setThumb and re-render so the
    // latest onCreate closure sees the populated thumbnail.
    await waitForThumbnail()
    const res = await h.capture.onCreate!(baseInput)

    expect(res.ok).toBe(true)
    const passedInput = createTicket.mock.calls[0]![2] as TicketInput
    expect(passedInput.inlineImage).toBeTruthy()
    expect(uploadAttachment).not.toHaveBeenCalled()
  })

  it('creates without an inline image when the thumbnail is oversized (null bytes)', async () => {
    // The sandbox returns null bytes when oversized (ThumbnailResult contract),
    // so `thumb` stays null: no inline image, and no separate upload path exists.
    sandboxRequest.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'export-thumbnail') {
        return { type: 'thumbnail', image: null, oversized: true }
      }
      return defaultReplies(msg)
    })
    createTicket.mockResolvedValue(okTicket())

    const onCreate = await renderAndGetOnCreate()
    const res = await onCreate(baseInput)

    expect(res.ok).toBe(true)
    const passedInput = createTicket.mock.calls[0]![2] as TicketInput
    expect(passedInput.inlineImage).toBeUndefined()
    expect(uploadAttachment).not.toHaveBeenCalled()
  })

  it('returns the provider error without writing a link when createTicket fails', async () => {
    createTicket.mockResolvedValue({ ok: false, reason: 'auth_failed', status: 401 })
    const onCreate = await renderAndGetOnCreate()
    const res = await onCreate(baseInput)
    expect(res.ok).toBe(false)
    expect(sandboxRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'write-ticket-link' }),
    )
  })

  it('returns auth_failed without calling the provider when no PAT is cached', async () => {
    sandboxRequest.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'get-pat') return { type: 'pat', pat: null }
      return defaultReplies(msg)
    })
    const onCreate = await renderAndGetOnCreate()
    const res = await onCreate(baseInput)
    expect(res).toMatchObject({ ok: false, reason: 'auth_failed' })
    expect(createTicket).not.toHaveBeenCalled()
  })
})

describe('App.onCreate — draft-pin fork', () => {
  it('appends to the existing pin when a draft pin is present', async () => {
    selection = singleSelection({ hasDraftPin: true })
    createTicket.mockResolvedValue(okTicket())
    const onCreate = await renderAndGetOnCreate()
    await onCreate(baseInput)
    expect(sandboxRequest).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'append-ticket-id-to-annotation', ticketId: '42' }),
    )
    expect(sandboxRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sync-annotation' }),
    )
  })

  it('syncs a fresh pin when no draft pin is present', async () => {
    selection = singleSelection({ hasDraftPin: false })
    createTicket.mockResolvedValue(okTicket())
    const onCreate = await renderAndGetOnCreate()
    await onCreate(baseInput)
    expect(sandboxRequest).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sync-annotation', ticketId: '42' }),
    )
    expect(sandboxRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'append-ticket-id-to-annotation' }),
    )
  })
})
