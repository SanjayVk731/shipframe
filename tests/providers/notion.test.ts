import { describe, it, expect, beforeEach } from 'vitest'
import { notionProvider } from '../../src/providers/notion'
import { installFetch, jsonResponse } from '../helpers/fetchMock'

beforeEach(() => {
  installFetch([])
})

describe('notion.testAuth', () => {
  it('returns ok when /users/me succeeds', async () => {
    installFetch([
      {
        matches: (u) => u === 'https://api.notion.com/v1/users/me',
        response: () => jsonResponse(200, { object: 'user' }),
      },
    ])
    const r = await notionProvider.testAuth('secret_x')
    expect(r.ok).toBe(true)
  })

  it('returns auth_failed on 401', async () => {
    installFetch([
      {
        matches: (u) => u.endsWith('/users/me'),
        response: () => jsonResponse(401, {}),
      },
    ])
    const r = await notionProvider.testAuth('bad')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('auth_failed')
  })

  it('sends Bearer token and Notion-Version header', async () => {
    let captured: RequestInit | undefined
    installFetch([
      {
        matches: (u, init) => {
          captured = init
          return u.endsWith('/users/me')
        },
        response: () => jsonResponse(200, {}),
      },
    ])
    await notionProvider.testAuth('secret_abc')
    const h = new Headers(captured?.headers)
    expect(h.get('Authorization')).toBe('Bearer secret_abc')
    expect(h.get('Notion-Version')).toBe('2022-06-28')
  })
})

describe('notion.listBoards', () => {
  it('maps databases to Board[]', async () => {
    installFetch([
      {
        matches: (u) => u.endsWith('/v1/search'),
        response: () =>
          jsonResponse(200, {
            results: [
              {
                id: 'db-1',
                title: [{ plain_text: 'Bugs' }],
              },
              {
                id: 'db-2',
                title: [{ plain_text: 'Specs' }],
              },
            ],
          }),
      },
    ])
    const r = await notionProvider.listBoards('p')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toEqual([
        { id: 'db-1', label: 'Bugs' },
        { id: 'db-2', label: 'Specs' },
      ])
    }
  })

  it('handles untitled databases', async () => {
    installFetch([
      {
        matches: (u) => u.endsWith('/v1/search'),
        response: () =>
          jsonResponse(200, { results: [{ id: 'db-3', title: [] }] }),
      },
    ])
    const r = await notionProvider.listBoards('p')
    if (r.ok) expect(r.value[0]?.label).toBe('Untitled')
  })
})

describe('notion.getFieldSchema', () => {
  it('extracts select/multi_select/people properties', async () => {
    installFetch([
      {
        matches: (u) => u.endsWith('/v1/databases/db-1'),
        response: () =>
          jsonResponse(200, {
            properties: {
              Name: { type: 'title' },
              Type: {
                type: 'select',
                select: { options: [{ id: 't1', name: 'Bug' }] },
              },
              Priority: {
                type: 'select',
                select: { options: [{ id: 'p1', name: 'P1' }] },
              },
              Assignee: { type: 'people' },
              Labels: {
                type: 'multi_select',
                multi_select: { options: [{ id: 'l1', name: 'urgent' }] },
              },
            },
          }),
      },
      {
        matches: (u) => u.endsWith('/v1/users'),
        response: () =>
          jsonResponse(200, {
            results: [
              { id: 'u1', name: 'Sanjay', type: 'person' },
              { id: 'b1', name: 'Bot', type: 'bot' },
            ],
          }),
      },
    ])
    const r = await notionProvider.getFieldSchema('p', 'db-1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.types).toEqual([{ id: 't1', label: 'Bug' }])
      expect(r.value.priorities).toEqual([{ id: 'p1', label: 'P1' }])
      expect(r.value.labels).toEqual([{ id: 'l1', label: 'urgent' }])
      expect(r.value.assignees).toEqual([{ id: 'u1', label: 'Sanjay' }])
    }
  })
})

describe('notion.createTicket', () => {
  it('POSTs /pages with parent.database_id and embeds figma link in children', async () => {
    let captured: RequestInit | undefined
    installFetch([
      {
        matches: (u) => u.endsWith('/v1/databases/db-1'),
        response: () =>
          jsonResponse(200, {
            properties: {
              Name: { type: 'title' },
              Type: {
                type: 'select',
                select: { options: [{ id: 't1', name: 'Bug' }] },
              },
              Priority: {
                type: 'select',
                select: { options: [{ id: 'p1', name: 'P1' }] },
              },
              Assignee: { type: 'people' },
              Labels: {
                type: 'multi_select',
                multi_select: { options: [{ id: 'l1', name: 'urgent' }] },
              },
            },
          }),
      },
      {
        matches: (u, init) => {
          if (u.endsWith('/v1/pages')) {
            captured = init
            return true
          }
          return false
        },
        response: () =>
          jsonResponse(200, { id: 'page-1', url: 'https://notion/page-1' }),
      },
    ])
    const r = await notionProvider.createTicket('p', 'db-1', {
      title: 'Hello',
      description: 'World',
      type: 't1',
      priority: 'p1',
      assigneeId: 'u1',
      labelIds: ['l1'],
      figmaDeepLink: 'https://figma.com/file/abc?node-id=1%3A2',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual({ id: 'page-1', url: 'https://notion/page-1' })
    const body = JSON.parse(captured?.body as string)
    expect(body.parent).toEqual({ database_id: 'db-1' })
    expect(Object.keys(body.properties).sort()).toEqual(
      ['Assignee', 'Labels', 'Name', 'Priority', 'Type'].sort(),
    )
    expect(body.properties.Name).toEqual({
      title: [{ text: { content: 'Hello' } }],
    })
    expect(body.properties.Type).toEqual({ select: { id: 't1' } })
    expect(body.properties.Priority).toEqual({ select: { id: 'p1' } })
    expect(body.properties.Assignee).toEqual({ people: [{ id: 'u1' }] })
    expect(body.properties.Labels).toEqual({
      multi_select: [{ id: 'l1' }],
    })
    const childTexts = JSON.stringify(body.children)
    expect(childTexts).toContain('https://figma.com/file/abc?node-id=1%3A2')
  })

  it('uses lowercased property names when DB renamed them', async () => {
    let captured: RequestInit | undefined
    installFetch([
      {
        matches: (u) => u.endsWith('/v1/databases/db-2'),
        response: () =>
          jsonResponse(200, {
            properties: {
              Task: { type: 'title' },
              priority: {
                type: 'select',
                select: { options: [{ id: 'p1', name: 'P1' }] },
              },
              Tags: {
                type: 'multi_select',
                multi_select: { options: [{ id: 'l1', name: 'urgent' }] },
              },
            },
          }),
      },
      {
        matches: (u, init) => {
          if (u.endsWith('/v1/pages')) {
            captured = init
            return true
          }
          return false
        },
        response: () =>
          jsonResponse(200, { id: 'page-2', url: 'https://notion/page-2' }),
      },
    ])
    const r = await notionProvider.createTicket('p', 'db-2', {
      title: 'A task',
      description: '',
      type: null,
      priority: 'p1',
      assigneeId: null,
      labelIds: ['l1'],
      figmaDeepLink: 'https://figma.com/file/xyz',
    })
    expect(r.ok).toBe(true)
    const body = JSON.parse(captured?.body as string)
    expect(Object.keys(body.properties).sort()).toEqual(
      ['Task', 'Tags', 'priority'].sort(),
    )
    expect(body.properties.Task).toEqual({
      title: [{ text: { content: 'A task' } }],
    })
    expect(body.properties.priority).toEqual({ select: { id: 'p1' } })
    expect(body.properties.Tags).toEqual({ multi_select: [{ id: 'l1' }] })
    expect(body.properties.Name).toBeUndefined()
    expect(body.properties.Priority).toBeUndefined()
    expect(body.properties.Labels).toBeUndefined()
  })

  it('skips fields when the DB has no matching property', async () => {
    let captured: RequestInit | undefined
    installFetch([
      {
        matches: (u) => u.endsWith('/v1/databases/db-3'),
        response: () =>
          jsonResponse(200, {
            properties: {
              Name: { type: 'title' },
            },
          }),
      },
      {
        matches: (u, init) => {
          if (u.endsWith('/v1/pages')) {
            captured = init
            return true
          }
          return false
        },
        response: () =>
          jsonResponse(200, { id: 'page-3', url: 'https://notion/page-3' }),
      },
    ])
    const r = await notionProvider.createTicket('p', 'db-3', {
      title: 'Minimal',
      description: '',
      type: 't1',
      priority: 'p1',
      assigneeId: 'u1',
      labelIds: ['l1'],
      figmaDeepLink: 'https://figma.com/file/abc',
    })
    expect(r.ok).toBe(true)
    const body = JSON.parse(captured?.body as string)
    expect(Object.keys(body.properties)).toEqual(['Name'])
    expect(body.properties.Type).toBeUndefined()
    expect(body.properties.Priority).toBeUndefined()
    expect(body.properties.Assignee).toBeUndefined()
    expect(body.properties.Labels).toBeUndefined()
  })

  it('fails when no title property exists', async () => {
    const fn = installFetch([
      {
        matches: (u) => u.endsWith('/v1/databases/db-4'),
        response: () =>
          jsonResponse(200, {
            properties: {
              Body: { type: 'rich_text' },
            },
          }),
      },
    ])
    const r = await notionProvider.createTicket('p', 'db-4', {
      title: 'Hello',
      description: '',
      type: null,
      priority: null,
      assigneeId: null,
      labelIds: [],
      figmaDeepLink: 'https://figma.com/file/abc',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unknown')
    // POST /v1/pages must never be called — no stub for it, so any call would throw.
    const calls = fn.mock.calls.map((c) => String(c[0]))
    expect(calls.some((u) => u.endsWith('/v1/pages'))).toBe(false)
  })
})

describe('notion.uploadAttachment', () => {
  it('returns supported:false without making any request', async () => {
    const fn = installFetch([])
    const r = await notionProvider.uploadAttachment(
      'p',
      { id: 'page-1', boardId: 'db-1' },
      new Uint8Array([1, 2, 3]),
      'thumb.png',
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.supported).toBe(false)
    expect(fn).not.toHaveBeenCalled()
  })
})
