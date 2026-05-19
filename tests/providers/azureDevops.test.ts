import { describe, it, expect, beforeEach } from 'vitest'
import { azureProvider } from '../../src/providers/azureDevops'
import { installFetch, jsonResponse } from '../helpers/fetchMock'

const BOARD_ID = 'myorg|MyProj|Bug'

beforeEach(() => {
  installFetch([])
})

describe('azure auth header', () => {
  it('uses Basic with base64(":" + pat)', async () => {
    let captured: RequestInit | undefined
    installFetch([
      {
        matches: (u, init) => {
          captured = init
          return u.includes('/_apis/projects')
        },
        response: () => jsonResponse(200, { value: [] }),
      },
    ])
    await azureProvider.listBoards('myorg|secret')
    const h = new Headers(captured?.headers)
    const expected = 'Basic ' + btoa(':secret')
    expect(h.get('Authorization')).toBe(expected)
  })
})

describe('azure.testAuth', () => {
  it('parses org out of pat string `org|pat` and hits projects', async () => {
    installFetch([
      {
        matches: (u) => u === 'https://dev.azure.com/myorg/_apis/projects?api-version=7.1',
        response: () => jsonResponse(200, { value: [] }),
      },
    ])
    const r = await azureProvider.testAuth('myorg|secret')
    expect(r.ok).toBe(true)
  })

  it('returns auth_failed on 401', async () => {
    installFetch([
      {
        matches: (u) => u.includes('/_apis/projects'),
        response: () => jsonResponse(401, {}),
      },
    ])
    const r = await azureProvider.testAuth('myorg|bad')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('auth_failed')
  })
})

describe('azure.listBoards', () => {
  it('produces project|workItemType combos from the fixed type list', async () => {
    installFetch([
      {
        matches: (u) => u.endsWith('/_apis/projects?api-version=7.1'),
        response: () =>
          jsonResponse(200, {
            value: [{ id: 'p1', name: 'MyProj' }],
          }),
      },
    ])
    const r = await azureProvider.listBoards('myorg|secret')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toEqual([
        { id: 'myorg|MyProj|Bug', label: 'MyProj / Bug' },
        { id: 'myorg|MyProj|Task', label: 'MyProj / Task' },
        { id: 'myorg|MyProj|User Story', label: 'MyProj / User Story' },
        { id: 'myorg|MyProj|Feature', label: 'MyProj / Feature' },
        { id: 'myorg|MyProj|Epic', label: 'MyProj / Epic' },
      ])
    }
  })
})

describe('azure.createTicket', () => {
  it('POSTs JSON Patch and includes figma link in description', async () => {
    let captured: RequestInit | undefined
    installFetch([
      {
        matches: (u, init) => {
          if (
            u ===
            'https://dev.azure.com/myorg/MyProj/_apis/wit/workitems/$Bug?api-version=7.1'
          ) {
            captured = init
            return true
          }
          return false
        },
        response: () =>
          jsonResponse(200, {
            id: 42,
            _links: { html: { href: 'https://dev.azure.com/myorg/_workitems/edit/42' } },
          }),
      },
    ])
    const r = await azureProvider.createTicket('myorg|secret', BOARD_ID, {
      title: 'Bug title',
      description: 'Body',
      type: null,
      priority: '2',
      assigneeId: 'me@x',
      labelIds: ['frontend'],
      figmaDeepLink: 'https://figma.com/file/abc?node-id=1%3A2',
    })
    expect(r.ok).toBe(true)
    if (r.ok)
      expect(r.value).toEqual({
        id: '42',
        url: 'https://dev.azure.com/myorg/_workitems/edit/42',
      })
    const h = new Headers(captured?.headers)
    expect(h.get('Content-Type')).toBe('application/json-patch+json')
    const ops = JSON.parse(captured?.body as string) as Array<{
      op: string
      path: string
      value: string
    }>
    const byPath = Object.fromEntries(ops.map((o) => [o.path, o.value]))
    expect(byPath['/fields/System.Title']).toBe('Bug title')
    expect(byPath['/fields/Microsoft.VSTS.Common.Priority']).toBe('2')
    expect(byPath['/fields/System.AssignedTo']).toBe('me@x')
    expect(byPath['/fields/System.Tags']).toBe('frontend')
    expect(byPath['/fields/System.Description']).toContain(
      'https://figma.com/file/abc?node-id=1%3A2',
    )
  })
})

describe('azure.uploadAttachment', () => {
  it('uploads then patches relations', async () => {
    const calls: string[] = []
    installFetch([
      {
        matches: (u) => {
          if (u.includes('/_apis/wit/attachments?fileName=')) {
            calls.push('upload')
            return true
          }
          return false
        },
        response: () =>
          jsonResponse(200, { url: 'https://attach/url-1' }),
      },
      {
        matches: (u) => {
          if (u === 'https://dev.azure.com/myorg/_apis/wit/workitems/42?api-version=7.1') {
            calls.push('patch')
            return true
          }
          return false
        },
        response: () => jsonResponse(200, {}),
      },
    ])
    const r = await azureProvider.uploadAttachment(
      'myorg|secret',
      { id: '42', boardId: BOARD_ID },
      new Uint8Array([1, 2, 3]),
      'thumb.png',
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.supported).toBe(true)
    expect(calls).toEqual(['upload', 'patch'])
  })
})

describe('azure.parsePat validation (via testAuth)', () => {
  it('rejects PAT with no separator', async () => {
    await expect(azureProvider.testAuth('nopipe')).rejects.toThrow(/org\|token/)
  })

  it('rejects PAT with empty org', async () => {
    await expect(azureProvider.testAuth('|secret')).rejects.toThrow(/org\|token/)
  })

  it('rejects PAT with empty token', async () => {
    await expect(azureProvider.testAuth('myorg|')).rejects.toThrow(/org\|token/)
  })
})

describe('azure.createTicket HTML escaping', () => {
  it('escapes figma deep link with ampersands', async () => {
    let captured: RequestInit | undefined
    installFetch([
      {
        matches: (u, init) => {
          if (u.endsWith('/wit/workitems/$Bug?api-version=7.1')) {
            captured = init
            return true
          }
          return false
        },
        response: () =>
          jsonResponse(200, {
            id: 99,
            _links: { html: { href: 'https://dev.azure.com/myorg/_workitems/edit/99' } },
          }),
      },
    ])
    await azureProvider.createTicket('myorg|secret', 'myorg|MyProj|Bug', {
      title: 't',
      description: 'desc with <script>',
      type: null,
      priority: null,
      assigneeId: null,
      labelIds: [],
      figmaDeepLink: 'https://figma.com/file/abc?node-id=1%3A2&t=foo',
    })
    const ops = JSON.parse(captured?.body as string) as Array<{ path: string; value: string }>
    const desc = ops.find((o) => o.path === '/fields/System.Description')?.value ?? ''
    // Ampersand must be escaped (twice — once in href, once in text)
    expect(desc).toContain('href="https://figma.com/file/abc?node-id=1%3A2&amp;t=foo"')
    expect(desc).toContain('>https://figma.com/file/abc?node-id=1%3A2&amp;t=foo<')
    // Description body still escaped
    expect(desc).toContain('&lt;script&gt;')
    expect(desc).not.toContain('<script>')
  })
})
