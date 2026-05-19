import type { TicketProvider } from './types'
import { tryRequest } from './tryRequest'

const API_VERSION = 'api-version=7.1'

function parsePat(combined: string): { org: string; token: string } {
  const idx = combined.indexOf('|')
  if (idx < 0) throw new Error('Azure PAT must be formatted as "org|token"')
  return { org: combined.slice(0, idx), token: combined.slice(idx + 1) }
}

function parseBoardId(boardId: string): {
  org: string
  project: string
  team: string
  workItemType: string
} {
  const [org, project, team, workItemType] = boardId.split('|')
  if (!org || !project || !team || !workItemType) {
    throw new Error(`invalid azure boardId: ${boardId}`)
  }
  return { org, project, team, workItemType }
}

function authHeader(token: string): string {
  return 'Basic ' + btoa(':' + token)
}

function patchHeaders(token: string): HeadersInit {
  return {
    Authorization: authHeader(token),
    'Content-Type': 'application/json-patch+json',
  }
}

export const azureProvider: TicketProvider = {
  id: 'azure',
  displayName: 'Azure DevOps',

  async testAuth(combined) {
    const { org, token } = parsePat(combined)
    const r = await tryRequest(() =>
      fetch(`https://dev.azure.com/${org}/_apis/projects?${API_VERSION}`, {
        headers: { Authorization: authHeader(token) },
      }),
    )
    if (!r.ok) return r
    return { ok: true, status: r.status, value: true as const }
  },

  async listBoards(combined) {
    const { org, token } = parsePat(combined)
    const projectsRes = await tryRequest<{
      value: Array<{ id: string; name: string }>
    }>(() =>
      fetch(`https://dev.azure.com/${org}/_apis/projects?${API_VERSION}`, {
        headers: { Authorization: authHeader(token) },
      }),
    )
    if (!projectsRes.ok) return projectsRes

    const boards: Array<{ id: string; label: string }> = []
    for (const project of projectsRes.value.value) {
      const teamsRes = await tryRequest<{
        value: Array<{ id: string; name: string }>
      }>(() =>
        fetch(
          `https://dev.azure.com/${org}/${project.name}/_apis/teams?${API_VERSION}`,
          { headers: { Authorization: authHeader(token) } },
        ),
      )
      if (!teamsRes.ok) return teamsRes
      const typesRes = await tryRequest<{ value: Array<{ name: string }> }>(
        () =>
          fetch(
            `https://dev.azure.com/${org}/${project.name}/_apis/wit/workitemtypes?${API_VERSION}`,
            { headers: { Authorization: authHeader(token) } },
          ),
      )
      if (!typesRes.ok) return typesRes
      for (const team of teamsRes.value.value) {
        for (const wit of typesRes.value.value) {
          boards.push({
            id: `${org}|${project.name}|${team.name}|${wit.name}`,
            label: `${project.name} / ${team.name} / ${wit.name}`,
          })
        }
      }
    }
    return { ok: true, status: projectsRes.status, value: boards }
  },

  async getFieldSchema(combined, boardId) {
    // Azure work item field schema is large; v1 ships a fixed set rather than fetching.
    void combined
    void boardId
    return {
      ok: true,
      status: 200,
      value: {
        types: [],
        priorities: [
          { id: '1', label: 'P1' },
          { id: '2', label: 'P2' },
          { id: '3', label: 'P3' },
          { id: '4', label: 'P4' },
        ],
        assignees: [],
        labels: [],
      },
    }
  },

  async createTicket(combined, boardId, ticket) {
    const { token } = parsePat(combined)
    const { org, project, workItemType } = parseBoardId(boardId)
    const ops: Array<{ op: 'add'; path: string; value: string }> = [
      { op: 'add', path: '/fields/System.Title', value: ticket.title },
    ]
    const descriptionHtml =
      `<p><strong>Figma frame:</strong> <a href="${ticket.figmaDeepLink}">${ticket.figmaDeepLink}</a></p>` +
      (ticket.description ? `<p>${escapeHtml(ticket.description)}</p>` : '')
    ops.push({
      op: 'add',
      path: '/fields/System.Description',
      value: descriptionHtml,
    })
    if (ticket.priority)
      ops.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.Common.Priority',
        value: ticket.priority,
      })
    if (ticket.assigneeId)
      ops.push({
        op: 'add',
        path: '/fields/System.AssignedTo',
        value: ticket.assigneeId,
      })
    if (ticket.labelIds.length > 0)
      ops.push({
        op: 'add',
        path: '/fields/System.Tags',
        value: ticket.labelIds.join('; '),
      })

    const r = await tryRequest<{
      id: number
      _links: { html: { href: string } }
    }>(() =>
      fetch(
        `https://dev.azure.com/${org}/${project}/_apis/wit/workitems/$${workItemType}?${API_VERSION}`,
        {
          method: 'POST',
          headers: patchHeaders(token),
          body: JSON.stringify(ops),
        },
      ),
    )
    if (!r.ok) return r
    return {
      ok: true,
      status: r.status,
      value: { id: String(r.value.id), url: r.value._links.html.href },
    }
  },

  async uploadAttachment(combined, ticketRef, image, fileName) {
    const { token } = parsePat(combined)
    const { org } = parseBoardId(ticketRef.boardId)
    const upload = await tryRequest<{ url: string }>(() =>
      fetch(
        `https://dev.azure.com/${org}/_apis/wit/attachments?fileName=${encodeURIComponent(fileName)}&${API_VERSION}`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader(token),
            'Content-Type': 'application/octet-stream',
          },
          body: image as BodyInit,
        },
      ),
    )
    if (!upload.ok) return upload
    const ops = [
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'AttachedFile',
          url: upload.value.url,
          attributes: { comment: 'Figma frame thumbnail' },
        },
      },
    ]
    const patch = await tryRequest(() =>
      fetch(
        `https://dev.azure.com/${org}/_apis/wit/workitems/${ticketRef.id}?${API_VERSION}`,
        {
          method: 'PATCH',
          headers: patchHeaders(token),
          body: JSON.stringify(ops),
        },
      ),
    )
    if (!patch.ok) return patch
    return { ok: true, status: patch.status, value: { supported: true } }
  },
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
