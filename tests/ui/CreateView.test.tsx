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

function renderView(
  props: { thumbnailOversized?: boolean; workItemType?: string } = {},
) {
  return render(
    <CreateView
      providerId="notion"
      boardId="db-1"
      boardLabel="Bugs"
      nodeName="Hero frame"
      thumbnail={null}
      thumbnailOversized={props.thumbnailOversized}
      workItemType={props.workItemType}
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

  it('calls onCreate with composed HTML description', async () => {
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
      description: '<p>Body</p>',
      type: 't-bug',
      priority: 'p1',
      figmaDeepLink: 'https://figma.com/file/abc?node-id=1%3A2',
    })
  })

  it('renders Bug sections (repro / expected / actual) when workItemType is Bug', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView({ workItemType: 'Bug' })
    await waitFor(() => screen.getByLabelText(/title/i))
    expect(screen.getByLabelText(/reproduction steps/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/expected behavior/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/actual behavior/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/acceptance criteria/i)).toBeNull()
  })

  it('renders Story sections (AC + out of scope) when workItemType is User Story', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView({ workItemType: 'User Story' })
    await waitFor(() => screen.getByLabelText(/title/i))
    expect(screen.getByLabelText(/acceptance criteria/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/out of scope/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/reproduction steps/i)).toBeNull()
  })

  it('renders Task sections (AC only) when workItemType is Task', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView({ workItemType: 'Task' })
    await waitFor(() => screen.getByLabelText(/title/i))
    expect(screen.getByLabelText(/acceptance criteria/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/out of scope/i)).toBeNull()
    expect(screen.queryByLabelText(/reproduction steps/i)).toBeNull()
  })

  it('renders Story sections by default when workItemType is unknown', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView({ workItemType: 'Something Custom' })
    await waitFor(() => screen.getByLabelText(/title/i))
    expect(screen.getByLabelText(/acceptance criteria/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/out of scope/i)).toBeInTheDocument()
  })

  it('composes structured Bug sections into the description on submit', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    onCreate.mockResolvedValue({ ok: true })
    renderView({ workItemType: 'Bug' })
    await waitFor(() => screen.getByLabelText(/title/i))
    await userEvent.type(screen.getByLabelText(/^description$/i), 'context line')
    await userEvent.type(
      screen.getByLabelText(/reproduction steps/i),
      'open\nclick',
    )
    await userEvent.type(screen.getByLabelText(/expected behavior/i), 'loads')
    await userEvent.type(screen.getByLabelText(/actual behavior/i), 'errors')
    await userEvent.click(screen.getByRole('button', { name: /create ticket/i }))
    await waitFor(() => expect(onCreate).toHaveBeenCalled())
    const desc = onCreate.mock.calls[0]?.[0]?.description as string
    expect(desc).toContain('<p>context line</p>')
    expect(desc).toContain('<h2>Reproduction steps</h2>')
    expect(desc).toContain('<li>open</li>')
    expect(desc).toContain('<li>click</li>')
    expect(desc).toContain('<h2>Expected behavior</h2><p>loads</p>')
    expect(desc).toContain('<h2>Actual behavior</h2><p>errors</p>')
  })

  it('shows error banner when schema fetch fails', async () => {
    getFieldSchema.mockResolvedValue({ ok: false, status: 401, reason: 'auth_failed' })
    renderView()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/token isn't working/i),
    )
  })

  it('shows a "too large to attach" warning when thumbnailOversized is true', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView({ thumbnailOversized: true })
    await waitFor(() => screen.getByLabelText(/title/i))
    const banner = screen.getByText(/too large to attach/i)
    expect(banner).toBeInTheDocument()
  })

  it('does not show the oversized warning by default', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView()
    await waitFor(() => screen.getByLabelText(/title/i))
    expect(screen.queryByText(/too large to attach/i)).toBeNull()
  })

  it('shows the providers error detail when create fails with a useful body', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    onCreate.mockResolvedValue({
      ok: false,
      status: 400,
      reason: 'unknown',
      detail: JSON.stringify({
        message:
          'TF401320: Rule Error for field Acme.RequiredCustomField. Error code: Required, FieldName: Acme.RequiredCustomField',
        typeKey: 'RuleValidationException',
      }),
    })
    renderView()
    await waitFor(() => screen.getByLabelText(/title/i))
    await userEvent.click(screen.getByRole('button', { name: /create ticket/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Acme\.RequiredCustomField/,
      ),
    )
  })
})
