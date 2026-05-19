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

    const dbRes = await tryRequest<{
      properties: Record<string, NotionProp>
    }>(() => fetch(`${API}/databases/${boardId}`, { headers: headers(pat) }))
    if (!dbRes.ok) return dbRes

    let types: Array<{ id: string; label: string }> = []
    let priorities: Array<{ id: string; label: string }> = []
    let labels: Array<{ id: string; label: string }> = []
    let needsPeople = false
    for (const [name, prop] of Object.entries(dbRes.value.properties)) {
      const lower = name.toLowerCase()
      if (isSelect(prop)) {
        const opts = prop.select.options.map((o) => ({ id: o.id, label: o.name }))
        if (lower === 'type') types = opts
        else if (lower === 'priority') priorities = opts
      } else if (isMultiSelect(prop)) {
        if (lower === 'labels' || lower === 'tags') {
          labels = prop.multi_select.options.map((o) => ({ id: o.id, label: o.name }))
        }
      } else if (prop.type === 'people') {
        needsPeople = true
      }
    }

    let assignees: Array<{ id: string; label: string }> = []
    if (needsPeople) {
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
    const properties: Record<string, unknown> = {
      Name: { title: [{ text: { content: ticket.title } }] },
    }
    if (ticket.type) properties.Type = { select: { id: ticket.type } }
    if (ticket.priority) properties.Priority = { select: { id: ticket.priority } }
    if (ticket.assigneeId)
      properties.Assignee = { people: [{ id: ticket.assigneeId }] }
    if (ticket.labelIds.length > 0)
      properties.Labels = { multi_select: ticket.labelIds.map((id) => ({ id })) }

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
