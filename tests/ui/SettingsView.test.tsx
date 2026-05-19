import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsView } from '../../src/ui/views/SettingsView'

const onSave = vi.fn()
const testAuth = vi.fn()
const listBoards = vi.fn()

beforeEach(() => {
  onSave.mockReset()
  testAuth.mockReset()
  listBoards.mockReset()
})

function renderView() {
  return render(
    <SettingsView
      initialProviderId={null}
      initialPat=""
      onSave={onSave}
      testAuth={testAuth}
      listBoards={listBoards}
    />,
  )
}

describe('SettingsView', () => {
  it('disables Test connection until provider + PAT entered', async () => {
    renderView()
    expect(screen.getByRole('button', { name: /test connection/i })).toBeDisabled()
    await userEvent.click(screen.getByLabelText(/notion/i))
    await userEvent.type(screen.getByLabelText(/personal access token/i), 'secret')
    expect(screen.getByRole('button', { name: /test connection/i })).toBeEnabled()
  })

  it('shows boards after successful auth', async () => {
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
    await userEvent.type(screen.getByLabelText(/personal access token/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() => screen.getByText(/Bugs/))
    expect(screen.getByText('Specs')).toBeInTheDocument()
  })

  it('shows auth error inline', async () => {
    testAuth.mockResolvedValue({ ok: false, status: 401, reason: 'auth_failed' })
    renderView()
    await userEvent.click(screen.getByLabelText(/notion/i))
    await userEvent.type(screen.getByLabelText(/personal access token/i), 'bad')
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
    await userEvent.type(screen.getByLabelText(/personal access token/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() =>
      expect(
        screen.getByText(/share each target database with this integration/i),
      ).toBeInTheDocument(),
    )
  })

  it('saves selected board', async () => {
    testAuth.mockResolvedValue({ ok: true, status: 200, value: true })
    listBoards.mockResolvedValue({
      ok: true,
      status: 200,
      value: [{ id: 'db-1', label: 'Bugs' }],
    })
    renderView()
    await userEvent.click(screen.getByLabelText(/notion/i))
    await userEvent.type(screen.getByLabelText(/personal access token/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() => screen.getByText('Bugs'))
    await userEvent.selectOptions(screen.getByLabelText(/board/i), 'db-1')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSave).toHaveBeenCalledWith({
      providerId: 'notion',
      pat: 'secret',
      config: { providerId: 'notion', boardId: 'db-1', boardLabel: 'Bugs' },
    })
  })
})
