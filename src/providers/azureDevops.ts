import type { TicketProvider } from './types'
import { tryRequest } from './tryRequest'
import { sanitizeHtml } from '../ui/composeDescription'

const API_VERSION = 'api-version=7.1'

function parsePat(combined: string): { org: string; token: string } {
  const idx = combined.indexOf('|')
  if (idx < 0) throw new Error('Azure PAT must be formatted as "org|token"')
  const org = combined.slice(0, idx)
  const token = combined.slice(idx + 1)
  if (!org || !token) throw new Error('Azure PAT must be formatted as "org|token"')
  return { org, token }
}

function parseBoardId(boardId: string): {
  org: string
  project: string
  workItemType: string
} {
  const [org, project, workItemType] = boardId.split('|')
  if (!org || !project || !workItemType) {
    throw new Error(`invalid azure boardId: ${boardId}`)
  }
  return { org, project, workItemType }
}

const DEFAULT_WORK_ITEM_TYPES = ['Bug', 'Task', 'User Story', 'Feature', 'Epic']

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
    // Azure DevOps's /_apis/teams and /_apis/wit/workitemtypes endpoints don't send
    // CORS headers for origin 'null' (Figma plugin iframe). We list projects (which
    // does work via CORS) and expand each one against a fixed set of common work item
    // types from the default Agile/Scrum/Basic process templates.
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
      for (const wit of DEFAULT_WORK_ITEM_TYPES) {
        boards.push({
          id: `${org}|${project.name}|${wit}`,
          label: `${project.name} / ${wit}`,
        })
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
    const ops: Array<{ op: 'add'; path: string; value: unknown }> = [
      { op: 'add', path: '/fields/System.Title', value: ticket.title },
    ]
    // Description is pre-composed HTML from the UI's composeDescription(): it
    // already handles escaping per section. The Figma link is attached as a
    // Hyperlink relation below, not embedded here, so description edits in
    // Azure don't clobber it.
    //
    // If an inline image was provided, upload it via Azure's attachment endpoint
    // first, then prepend an <img> referencing the returned URL. The <img> tag is
    // trusted (the URL comes from Azure's own attachment response) — we don't
    // re-escape ticket.description, which is already sanitized HTML. If the upload
    // fails we proceed with the plain description rather than failing createTicket.
    let descriptionBody = ticket.description ?? ''
    if (ticket.inlineImage) {
      // Wrap in a Blob: Figma's UI iframe runtime stringifies Uint8Array bodies
      // ("[object Uint8Array]") when passed directly to fetch().
      const blob = new Blob([new Uint8Array(ticket.inlineImage.bytes)], {
        type: 'image/png',
      })
      const up = await tryRequest<{ url: string }>(() =>
        fetch(
          `https://dev.azure.com/${org}/_apis/wit/attachments?fileName=${encodeURIComponent(
            ticket.inlineImage!.filename,
          )}&${API_VERSION}`,
          {
            method: 'POST',
            headers: {
              Authorization: authHeader(token),
              'Content-Type': 'application/octet-stream',
            },
            body: blob,
          },
        ),
      )
      if (up.ok) {
        const imgTag = `<img src="${up.value.url}" alt="Frame screenshot"/>`
        // Defense in depth: re-run the assembled (img + already-sanitized body)
        // through the SAME conservative allow-list. The img URL is trusted (it
        // comes from Azure's own attachment response), but this guarantees no
        // event handler or javascript: URL can ever reach System.Description,
        // regardless of how the img tag was built.
        descriptionBody = sanitizeHtml(`${imgTag}\n${descriptionBody}`)
      }
    }
    if (descriptionBody && descriptionBody.length > 0) {
      ops.push({
        op: 'add',
        path: '/fields/System.Description',
        value: descriptionBody,
      })
    }
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
    if (ticket.acceptanceCriteriaHtml && ticket.acceptanceCriteriaHtml.length > 0) {
      ops.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
        value: ticket.acceptanceCriteriaHtml,
      })
    }
    if (ticket.reproStepsHtml && ticket.reproStepsHtml.length > 0) {
      ops.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.TCM.ReproSteps',
        value: ticket.reproStepsHtml,
      })
    }
    ops.push({
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'Hyperlink',
        url: ticket.figmaDeepLink,
        attributes: { comment: 'Figma frame' },
      },
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
    // Wrap in a Blob: Figma's UI iframe runtime stringifies Uint8Array bodies
    // ("[object Uint8Array]") when passed directly to fetch(), so the upload
    // succeeds with garbage bytes and Azure returns a URL pointing at a corrupt file.
    const body = new Blob([new Uint8Array(image)], { type: 'image/png' })
    const upload = await tryRequest<{ url: string }>(() =>
      fetch(
        `https://dev.azure.com/${org}/_apis/wit/attachments?fileName=${encodeURIComponent(fileName)}&${API_VERSION}`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader(token),
            'Content-Type': 'application/octet-stream',
          },
          body,
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
