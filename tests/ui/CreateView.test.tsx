import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateView } from '../../src/ui/views/CreateView'

const schema = {
  types: [{ id: 't-bug', label: 'Bug' }],
  priorities: [{ id: 'p1', label: 'P1' }],
  assignees: [{ id: 'me', label: 'Me' }],
  labels: [{ id: 'frontend', label: 'frontend' }],
}

const getFieldSchema = vi.fn()
const onCreate = vi.fn()

beforeEach(() => {
  getFieldSchema.mockReset()
  onCreate.mockReset()
})

function renderView() {
  return render(
    <CreateView
      providerId="notion"
      boardId="db-1"
      boardLabel="Bugs"
      nodeName="Hero frame"
      thumbnail={null}
      figmaDeepLink="https://figma.com/file/abc?node-id=1%3A2"
      getFieldSchema={getFieldSchema}
      onCreate={onCreate}
    />,
  )
}

describe('CreateView', () => {
  it('prefills title from nodeName', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView()
    await waitFor(() => {
      expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe(
        'Hero frame',
      )
    })
  })

  it('disables Create when title empty', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView()
    await waitFor(() => screen.getByLabelText(/title/i))
    const title = screen.getByLabelText(/title/i)
    await userEvent.clear(title)
    expect(screen.getByRole('button', { name: /create ticket/i })).toBeDisabled()
  })

  it('calls onCreate with form contents', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    onCreate.mockResolvedValue({ ok: true })
    renderView()
    await waitFor(() => screen.getByLabelText(/title/i))
    await userEvent.type(screen.getByLabelText(/description/i), 'Body')
    await userEvent.selectOptions(screen.getByLabelText(/type/i), 't-bug')
    await userEvent.selectOptions(screen.getByLabelText(/priority/i), 'p1')
    await userEvent.click(screen.getByRole('button', { name: /create ticket/i }))
    await waitFor(() => expect(onCreate).toHaveBeenCalled())
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({
      title: 'Hero frame',
      description: 'Body',
      type: 't-bug',
      priority: 'p1',
      figmaDeepLink: 'https://figma.com/file/abc?node-id=1%3A2',
    })
  })

  it('shows error banner when schema fetch fails', async () => {
    getFieldSchema.mockResolvedValue({ ok: false, status: 401, reason: 'auth_failed' })
    renderView()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/token isn't working/i),
    )
  })
})
