import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsView, parseFileKey } from '../../src/ui/views/SettingsView'

const onSave = vi.fn()
const testAuth = vi.fn()
const listBoards = vi.fn()

beforeEach(() => {
  onSave.mockReset()
  testAuth.mockReset()
  listBoards.mockReset()
})

function renderView(initial?: Partial<{
  providerId: 'notion' | 'azure'
  pat: string
  fileKey: string
  board: { id: string; label: string } | null
}>) {
  return render(
    <SettingsView
      initialProviderId={initial?.providerId ?? null}
      initialPat={initial?.pat ?? ''}
      initialFileKey={initial?.fileKey ?? ''}
      initialBoard={initial?.board ?? null}
      onSave={onSave}
      testAuth={testAuth}
      listBoards={listBoards}
    />,
  )
}

describe('SettingsView (Notion)', () => {
  it('Test connection is hidden until a provider is selected, then disabled until token entered', async () => {
    renderView()
    expect(screen.queryByRole('button', { name: /test connection/i })).toBeNull()
    await userEvent.click(screen.getByLabelText(/notion/i))
    expect(screen.getByRole('button', { name: /test connection/i })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/notion integration token/i), 'secret')
    expect(screen.getByRole('button', { name: /test connection/i })).toBeEnabled()
  })

  it('shows databases after successful auth', async () => {
    testAuth.mockResolvedValue({ ok: true, status: 200, value: true })
    listBoards.mockResolvedValue({
      ok: true,
      status: 200,
      value: [
        { id: 'db-1', label: 'Bugs' },
        { id: 'db-2', label: 'Specs' },
      ],
    })
    renderView()
    await userEvent.click(screen.getByLabelText(/notion/i))
    await userEvent.type(screen.getByLabelText(/notion integration token/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() => screen.getByText(/Bugs/))
    expect(screen.getByText('Specs')).toBeInTheDocument()
  })

  it('shows auth error inline', async () => {
    testAuth.mockResolvedValue({ ok: false, status: 401, reason: 'auth_failed' })
    renderView()
    await userEvent.click(screen.getByLabelText(/notion/i))
    await userEvent.type(screen.getByLabelText(/notion integration token/i), 'bad')
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/token isn't working/i),
    )
  })

  it('shows empty-databases help text for Notion', async () => {
    testAuth.mockResolvedValue({ ok: true, status: 200, value: true })
    listBoards.mockResolvedValue({ ok: true, status: 200, value: [] })
    renderView()
    await userEvent.click(screen.getByLabelText(/notion/i))
    await userEvent.type(screen.getByLabelText(/notion integration token/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() =>
      expect(
        screen.getByText(/share each target database with this integration/i),
      ).toBeInTheDocument(),
    )
  })

  it('saves selected database with parsed file key', async () => {
    testAuth.mockResolvedValue({ ok: true, status: 200, value: true })
    listBoards.mockResolvedValue({
      ok: true,
      status: 200,
      value: [{ id: 'db-1', label: 'Bugs' }],
    })
    renderView()
    await userEvent.click(screen.getByLabelText(/notion/i))
    await userEvent.type(screen.getByLabelText(/notion integration token/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() => screen.getByText('Bugs'))
    await userEvent.selectOptions(screen.getByLabelText(/database/i), 'db-1')
    await userEvent.type(
      screen.getByLabelText(/figma file url/i),
      'https://www.figma.com/design/abc123/My-File',
    )
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSave).toHaveBeenCalledWith({
      providerId: 'notion',
      pat: 'secret',
      config: {
        providerId: 'notion',
        boardId: 'db-1',
        boardLabel: 'Bugs',
        fileKey: 'abc123',
      },
    })
  })

  it('Save is disabled until a valid Figma URL is pasted', async () => {
    testAuth.mockResolvedValue({ ok: true, status: 200, value: true })
    listBoards.mockResolvedValue({
      ok: true,
      status: 200,
      value: [{ id: 'db-1', label: 'Bugs' }],
    })
    renderView()
    await userEvent.click(screen.getByLabelText(/notion/i))
    await userEvent.type(screen.getByLabelText(/notion integration token/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() => screen.getByText('Bugs'))
    await userEvent.selectOptions(screen.getByLabelText(/database/i), 'db-1')
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/figma file url/i), 'not a url')
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
    expect(screen.getByText(/doesn't look like a Figma URL/i)).toBeInTheDocument()
  })
})

describe('SettingsView (Azure DevOps)', () => {
  it('separate org and token fields combine into org|token PAT', async () => {
    let calledWith = ''
    testAuth.mockImplementation(async (_id: string, pat: string) => {
      calledWith = pat
      return { ok: true, status: 200, value: true }
    })
    listBoards.mockResolvedValue({ ok: true, status: 200, value: [] })
    renderView()
    await userEvent.click(screen.getByLabelText(/azure devops/i))
    await userEvent.type(screen.getByLabelText(/azure devops organization/i), 'myorg')
    await userEvent.type(screen.getByLabelText(/personal access token/i), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() => expect(testAuth).toHaveBeenCalled())
    expect(calledWith).toBe('myorg|secret123')
  })

  it('shows Project + Work item type as separate dropdowns', async () => {
    testAuth.mockResolvedValue({ ok: true, status: 200, value: true })
    listBoards.mockResolvedValue({
      ok: true,
      status: 200,
      value: [
        { id: 'myorg|ProjA|Bug', label: 'ProjA / Bug' },
        { id: 'myorg|ProjA|Task', label: 'ProjA / Task' },
        { id: 'myorg|ProjB|Bug', label: 'ProjB / Bug' },
      ],
    })
    renderView()
    await userEvent.click(screen.getByLabelText(/azure devops/i))
    await userEvent.type(screen.getByLabelText(/azure devops organization/i), 'myorg')
    await userEvent.type(screen.getByLabelText(/personal access token/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() => screen.getByLabelText(/^project$/i))

    const projectSelect = screen.getByLabelText(/^project$/i) as HTMLSelectElement
    const witSelect = screen.getByLabelText(/work item type/i) as HTMLSelectElement
    // Defaults to first board: ProjA / Bug.
    expect(projectSelect.value).toBe('ProjA')
    expect(witSelect.value).toBe('Bug')

    // Switching project switches type list.
    await userEvent.selectOptions(projectSelect, 'ProjB')
    expect(projectSelect.value).toBe('ProjB')
    expect(witSelect.value).toBe('Bug') // only Bug exists for ProjB

    await userEvent.selectOptions(projectSelect, 'ProjA')
    await userEvent.selectOptions(witSelect, 'Task')
    expect(witSelect.value).toBe('Task')
  })

  it('saves with the right boardId for the chosen Project + Type', async () => {
    testAuth.mockResolvedValue({ ok: true, status: 200, value: true })
    listBoards.mockResolvedValue({
      ok: true,
      status: 200,
      value: [
        { id: 'myorg|ProjA|Bug', label: 'ProjA / Bug' },
        { id: 'myorg|ProjA|Task', label: 'ProjA / Task' },
      ],
    })
    renderView()
    await userEvent.click(screen.getByLabelText(/azure devops/i))
    await userEvent.type(screen.getByLabelText(/azure devops organization/i), 'myorg')
    await userEvent.type(screen.getByLabelText(/personal access token/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() => screen.getByLabelText(/^project$/i))
    await userEvent.selectOptions(screen.getByLabelText(/work item type/i), 'Task')
    await userEvent.type(
      screen.getByLabelText(/figma file url/i),
      'https://www.figma.com/design/abc123/My-File',
    )
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSave).toHaveBeenCalledWith({
      providerId: 'azure',
      pat: 'myorg|secret',
      config: {
        providerId: 'azure',
        boardId: 'myorg|ProjA|Task',
        boardLabel: 'ProjA / Task',
        fileKey: 'abc123',
      },
    })
  })

  it('prefills org and token fields from an existing org|token PAT', () => {
    renderView({ providerId: 'azure', pat: 'myorg|abc123' })
    const orgInput = screen.getByLabelText(/azure devops organization/i) as HTMLInputElement
    const tokenInput = screen.getByLabelText(/personal access token/i) as HTMLInputElement
    expect(orgInput.value).toBe('myorg')
    expect(tokenInput.value).toBe('abc123')
  })

  it('shows the saved Project + Type immediately without re-testing', () => {
    renderView({
      providerId: 'azure',
      pat: 'myorg|abc123',
      fileKey: 'fk',
      board: { id: 'myorg|PlatformNX|Bug', label: 'PlatformNX / Bug' },
    })
    const projectSelect = screen.getByLabelText(/^project$/i) as HTMLSelectElement
    const witSelect = screen.getByLabelText(/work item type/i) as HTMLSelectElement
    expect(projectSelect.value).toBe('PlatformNX')
    expect(witSelect.value).toBe('Bug')
    // Save is available immediately — no Test connection required.
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled()
  })
})

describe('SettingsView persistence (Notion)', () => {
  it('shows the saved Database immediately without re-testing', () => {
    renderView({
      providerId: 'notion',
      pat: 'secret-token',
      fileKey: 'fk',
      board: { id: 'db-1', label: 'Bugs' },
    })
    const dbSelect = screen.getByLabelText(/database/i) as HTMLSelectElement
    expect(dbSelect.value).toBe('db-1')
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled()
  })
})

describe('parseFileKey', () => {
  it('parses /design/ URLs', () => {
    expect(parseFileKey('https://www.figma.com/design/abc123/Untitled?node-id=1-2')).toBe('abc123')
  })
  it('parses /file/ URLs (legacy)', () => {
    expect(parseFileKey('https://www.figma.com/file/xyz789/My-File')).toBe('xyz789')
  })
  it('parses /board/ URLs (FigJam)', () => {
    expect(parseFileKey('https://www.figma.com/board/bk1/Board')).toBe('bk1')
  })
  it('returns null for non-Figma URLs', () => {
    expect(parseFileKey('https://example.com/design/abc/foo')).toBeNull()
    expect(parseFileKey('not a url at all')).toBeNull()
    expect(parseFileKey('')).toBeNull()
  })
})
