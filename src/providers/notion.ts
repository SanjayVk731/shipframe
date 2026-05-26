import type { TicketProvider } from './types'
import { tryRequest } from './tryRequest'

const API = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'

function headers(pat: string): HeadersInit {
  return {
    Authorization: `Bearer ${pat}`,
    'Notion-Version': VERSION,
    'Content-Type': 'application/json',
  }
}

function titleOf(db: { title?: Array<{ plain_text?: string }> }): string {
  const parts = db.title ?? []
  const joined = parts.map((p) => p.plain_text ?? '').join('').trim()
  return joined.length > 0 ? joined : 'Untitled'
}

interface SelectProp {
  type: 'select'
  select: { options: Array<{ id: string; name: string }> }
}
interface MultiSelectProp {
  type: 'multi_select'
  multi_select: { options: Array<{ id: string; name: string }> }
}
interface OtherProp {
  type: string
}
type NotionProp = SelectProp | MultiSelectProp | OtherProp
const isSelect = (p: NotionProp): p is SelectProp => p.type === 'select'
const isMultiSelect = (p: NotionProp): p is MultiSelectProp =>
  p.type === 'multi_select'

interface DiscoveredProps {
  titleProp: string | null
  typeProp: string | null
  priorityProp: string | null
  assigneeProp: string | null
  labelsProp: string | null
}

function discoverPropertyNames(db: {
  properties: Record<string, NotionProp>
}): DiscoveredProps {
  let titleProp: string | null = null
  let typeProp: string | null = null
  let priorityProp: string | null = null
  let assigneeProp: string | null = null
  let labelsProp: string | null = null

  for (const [name, prop] of Object.entries(db.properties)) {
    const lower = name.toLowerCase()
    if (prop.type === 'title' && titleProp === null) {
      titleProp = name
    } else if (isSelect(prop)) {
      if (lower === 'type' && typeProp === null) typeProp = name
      else if (lower === 'priority' && priorityProp === null) priorityProp = name
    } else if (isMultiSelect(prop)) {
      if ((lower === 'labels' || lower === 'tags') && labelsProp === null) {
        labelsProp = name
      }
    } else if (prop.type === 'people' && assigneeProp === null) {
      assigneeProp = name
    }
  }

  return { titleProp, typeProp, priorityProp, assigneeProp, labelsProp }
}

async function uploadFileForBlock(
  pat: string,
  bytes: Uint8Array,
  filename: string,
): Promise<{ ok: true; uploadId: string } | { ok: false }> {
  const create = await tryRequest<{ id: string }>(() =>
    fetch(`${API}/file_uploads`, {
      method: 'POST',
      headers: headers(pat),
      body: JSON.stringify({ filename, content_type: 'image/png' }),
    }),
  )
  if (!create.ok) return { ok: false }
  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
    filename,
  )
  const send = await tryRequest<unknown>(() =>
    fetch(`${API}/file_uploads/${create.value.id}/send`, {
      method: 'POST',
      // NOTE: do NOT set Content-Type here — the browser sets the multipart
      // boundary automatically. Only Authorization + Notion-Version.
      headers: {
        Authorization: `Bearer ${pat}`,
        'Notion-Version': VERSION,
      },
      body: form,
    }),
  )
  if (!send.ok) return { ok: false }
  return { ok: true, uploadId: create.value.id }
}

export const notionProvider: TicketProvider = {
  id: 'notion',
  displayName: 'Notion',

  async testAuth(pat) {
    const r = await tryRequest(() =>
      fetch(`${API}/users/me`, { headers: headers(pat) }),
    )
    if (!r.ok) return r
    return { ok: true, value: true as const, status: r.status }
  },

  async listBoards(pat) {
    const r = await tryRequest<{
      results: Array<{ id: string; title?: Array<{ plain_text?: string }> }>
    }>(() =>
      fetch(`${API}/search`, {
        method: 'POST',
        headers: headers(pat),
        body: JSON.stringify({ filter: { property: 'object', value: 'database' } }),
      }),
    )
    if (!r.ok) return r
    return {
      ok: true,
      status: r.status,
      value: r.value.results.map((db) => ({ id: db.id, label: titleOf(db) })),
    }
  },

  async getFieldSchema(pat, boardId) {
    const dbRes = await tryRequest<{
      properties: Record<string, NotionProp>
    }>(() => fetch(`${API}/databases/${boardId}`, { headers: headers(pat) }))
    if (!dbRes.ok) return dbRes

    const discovered = discoverPropertyNames(dbRes.value)

    let types: Array<{ id: string; label: string }> = []
    let priorities: Array<{ id: string; label: string }> = []
    let labels: Array<{ id: string; label: string }> = []

    if (discovered.typeProp) {
      const prop = dbRes.value.properties[discovered.typeProp]
      if (prop && isSelect(prop)) {
        types = prop.select.options.map((o) => ({ id: o.id, label: o.name }))
      }
    }
    if (discovered.priorityProp) {
      const prop = dbRes.value.properties[discovered.priorityProp]
      if (prop && isSelect(prop)) {
        priorities = prop.select.options.map((o) => ({ id: o.id, label: o.name }))
      }
    }
    if (discovered.labelsProp) {
      const prop = dbRes.value.properties[discovered.labelsProp]
      if (prop && isMultiSelect(prop)) {
        labels = prop.multi_select.options.map((o) => ({ id: o.id, label: o.name }))
      }
    }

    let assignees: Array<{ id: string; label: string }> = []
    if (discovered.assigneeProp) {
      const usersRes = await tryRequest<{
        results: Array<{ id: string; name?: string; type: string }>
      }>(() => fetch(`${API}/users`, { headers: headers(pat) }))
      if (!usersRes.ok) return usersRes
      assignees = usersRes.value.results
        .filter((u) => u.type === 'person')
        .map((u) => ({ id: u.id, label: u.name ?? u.id }))
    }

    return {
      ok: true,
      status: dbRes.status,
      value: { types, priorities, assignees, labels },
    }
  },

  async createTicket(pat, boardId, ticket) {
    const dbRes = await tryRequest<{
      properties: Record<string, NotionProp>
    }>(() => fetch(`${API}/databases/${boardId}`, { headers: headers(pat) }))
    if (!dbRes.ok) return dbRes

    const discovered = discoverPropertyNames(dbRes.value)

    if (!discovered.titleProp) {
      return {
        ok: false,
        reason: 'unknown',
        status: 500,
        detail: 'no title property on database',
      }
    }

    const properties: Record<string, unknown> = {
      [discovered.titleProp]: { title: [{ text: { content: ticket.title } }] },
    }
    if (ticket.type && discovered.typeProp) {
      properties[discovered.typeProp] = { select: { id: ticket.type } }
    }
    if (ticket.priority && discovered.priorityProp) {
      properties[discovered.priorityProp] = { select: { id: ticket.priority } }
    }
    if (ticket.assigneeId && discovered.assigneeProp) {
      properties[discovered.assigneeProp] = {
        people: [{ id: ticket.assigneeId }],
      }
    }
    if (ticket.labelIds.length > 0 && discovered.labelsProp) {
      properties[discovered.labelsProp] = {
        multi_select: ticket.labelIds.map((id) => ({ id })),
      }
    }

    const children: unknown[] = [
      {
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: [
            {
              type: 'text',
              text: { content: 'Figma frame: ', link: null },
            },
            {
              type: 'text',
              text: { content: ticket.figmaDeepLink, link: { url: ticket.figmaDeepLink } },
            },
          ],
          icon: { type: 'emoji', emoji: '🎨' },
        },
      },
    ]
    if (ticket.description.trim().length > 0) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: ticket.description } }],
        },
      })
    }

    if (ticket.inlineImage) {
      const up = await uploadFileForBlock(
        pat,
        ticket.inlineImage.bytes,
        ticket.inlineImage.filename,
      )
      if (up.ok) {
        children.push({
          object: 'block',
          type: 'image',
          image: {
            type: 'file_upload',
            file_upload: { id: up.uploadId },
          },
        })
      }
    }

    const r = await tryRequest<{ id: string; url: string }>(() =>
      fetch(`${API}/pages`, {
        method: 'POST',
        headers: headers(pat),
        body: JSON.stringify({
          parent: { database_id: boardId },
          properties,
          children,
        }),
      }),
    )
    if (!r.ok) return r
    return { ok: true, status: r.status, value: { id: r.value.id, url: r.value.url } }
  },

  async uploadAttachment() {
    return { ok: true, status: 200, value: { supported: false } }
  },
}
