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
  props: {
    thumbnail?: Uint8Array | null
    thumbnailOversized?: boolean
    workItemType?: string
    hasDraftPin?: boolean
    aiConfig?: import('../../src/storage/aiConfig').AiConfig
    clearAiAnnotation?: (markdown?: string) => Promise<{ type: string; reason?: string }>
    writeAiAnnotation?: (markdown: string) => Promise<{ type: string; reason?: string }>
  } = {},
) {
  return render(
    <CreateView
      providerId="notion"
      boardId="db-1"
      boardLabel="Bugs"
      nodeName="Hero frame"
      thumbnail={props.thumbnail ?? null}
      thumbnailOversized={props.thumbnailOversized}
      workItemType={props.workItemType}
      figmaDeepLink="https://figma.com/file/abc?node-id=1%3A2"
      getFieldSchema={getFieldSchema}
      onCreate={onCreate}
      aiConfig={props.aiConfig}
      hasDraftPin={props.hasDraftPin}
      writeAiAnnotation={props.writeAiAnnotation}
      clearAiAnnotation={props.clearAiAnnotation}
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

  it('calls onCreate with composed HTML description that includes the Figma link', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    onCreate.mockResolvedValue({ ok: true })
    renderView()
    await waitFor(() => screen.getByLabelText(/title/i))
    await userEvent.type(screen.getByLabelText(/description/i), 'Body')
    await userEvent.selectOptions(screen.getByLabelText(/type/i), 't-bug')
    await userEvent.selectOptions(screen.getByLabelText(/priority/i), 'p1')
    await userEvent.click(screen.getByRole('button', { name: /create ticket/i }))
    await waitFor(() => expect(onCreate).toHaveBeenCalled())
    const arg = onCreate.mock.calls[0]?.[0]
    expect(arg).toMatchObject({
      title: 'Hero frame',
      type: 't-bug',
      priority: 'p1',
      figmaDeepLink: 'https://figma.com/file/abc?node-id=1%3A2',
    })
    expect(arg?.description).toContain('<p>Body</p>')
    expect(arg?.description).toContain('<strong>Figma:</strong>')
    expect(arg?.description).toContain(
      'href="https://figma.com/file/abc?node-id=1%3A2"',
    )
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

  it('routes Bug sections to the right fields on submit', async () => {
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
    const arg = onCreate.mock.calls[0]?.[0]
    const desc = arg?.description as string
    // Description: figma link, main body, expected, actual — NOT repro
    expect(desc).toContain('<strong>Figma:</strong>')
    expect(desc).toContain('<p>context line</p>')
    expect(desc).toContain('<h2>Expected behavior</h2><p>loads</p>')
    expect(desc).toContain('<h2>Actual behavior</h2><p>errors</p>')
    expect(desc).not.toContain('Reproduction')
    // Repro steps live in their own field
    expect(arg?.reproStepsHtml).toBe('<ol><li>open</li><li>click</li></ol>')
    // No AC on a Bug
    expect(arg?.acceptanceCriteriaHtml ?? '').toBe('')
  })

  it('routes Story AC to its own field, not into description', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    onCreate.mockResolvedValue({ ok: true })
    renderView({ workItemType: 'User Story' })
    await waitFor(() => screen.getByLabelText(/title/i))
    await userEvent.type(screen.getByLabelText(/^description$/i), 'context')
    await userEvent.type(
      screen.getByLabelText(/acceptance criteria/i),
      '- A\n- B',
    )
    await userEvent.click(screen.getByRole('button', { name: /create ticket/i }))
    await waitFor(() => expect(onCreate).toHaveBeenCalled())
    const arg = onCreate.mock.calls[0]?.[0]
    expect(arg?.acceptanceCriteriaHtml).toBe('<ul><li>A</li><li>B</li></ul>')
    expect(arg?.description).not.toContain('Acceptance')
    expect(arg?.description).not.toContain('<li>A</li>')
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

  it('shows "Publish" and "Discard draft pin" when hasDraftPin is true', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    const writeAiAnnotation = vi.fn(async () => ({ type: 'ack' }))
    const clearAiAnnotation = vi.fn(async () => ({ type: 'ack' }))
    renderView({
      hasDraftPin: true,
      aiConfig: { provider: 'anthropic', key: 'sk-test' },
      writeAiAnnotation,
      clearAiAnnotation,
    })
    await waitFor(() => screen.getByLabelText(/title/i))
    expect(screen.getByRole('button', { name: /^publish$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create ticket/i })).toBeNull()
    expect(
      screen.getByRole('button', { name: /discard draft pin/i }),
    ).toBeInTheDocument()
  })

  it('shows "Create ticket" and no "Discard draft pin" when hasDraftPin is false', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView({
      hasDraftPin: false,
      aiConfig: { provider: 'anthropic', key: 'sk-test' },
      writeAiAnnotation: vi.fn(async () => ({ type: 'ack' })),
      clearAiAnnotation: vi.fn(async () => ({ type: 'ack' })),
    })
    await waitFor(() => screen.getByLabelText(/title/i))
    expect(
      screen.getByRole('button', { name: /create ticket/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^publish$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /discard draft pin/i })).toBeNull()
  })

  it('calls clearAiAnnotation when "Discard draft pin" is clicked', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    const clearAiAnnotation = vi.fn(async () => ({ type: 'ack' }))
    renderView({
      hasDraftPin: true,
      aiConfig: { provider: 'anthropic', key: 'sk-test' },
      writeAiAnnotation: vi.fn(async () => ({ type: 'ack' })),
      clearAiAnnotation,
    })
    await waitFor(() => screen.getByLabelText(/title/i))
    await userEvent.click(
      screen.getByRole('button', { name: /discard draft pin/i }),
    )
    await waitFor(() => expect(clearAiAnnotation).toHaveBeenCalled())
  })

  it('renders an enabled "Include image" toggle (checked) when a thumbnail is available', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView({
      thumbnail: new Uint8Array([1, 2, 3]),
      aiConfig: { provider: 'anthropic', key: 'sk-test' },
    })
    await waitFor(() => screen.getByLabelText(/title/i))
    const toggle = screen.getByRole('checkbox', { name: /include image/i }) as HTMLInputElement
    expect(toggle).toBeInTheDocument()
    expect(toggle.checked).toBe(true)
    expect(toggle).not.toBeDisabled()
  })

  it('disables the "Include image" toggle when no thumbnail is available', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView({
      thumbnail: null,
      aiConfig: { provider: 'anthropic', key: 'sk-test' },
    })
    await waitFor(() => screen.getByLabelText(/title/i))
    const toggle = screen.getByRole('checkbox', { name: /include image/i }) as HTMLInputElement
    expect(toggle).toBeDisabled()
    expect(toggle.checked).toBe(false)
  })

  it('disables the "Include image" toggle when the thumbnail is oversized', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView({
      thumbnail: new Uint8Array([1, 2, 3]),
      thumbnailOversized: true,
      aiConfig: { provider: 'anthropic', key: 'sk-test' },
    })
    await waitFor(() => screen.getByLabelText(/title/i))
    const toggle = screen.getByRole('checkbox', { name: /include image/i }) as HTMLInputElement
    expect(toggle).toBeDisabled()
    expect(toggle.checked).toBe(false)
  })

  it('ENABLES AI Draft from a screenshot alone (no text layers / annotations)', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    // No annotationsCount/textLayersCount passed → both default to 0. A
    // thumbnail is available and the toggle defaults on, so vision can draft.
    renderView({
      thumbnail: new Uint8Array([1, 2, 3]),
      aiConfig: { provider: 'anthropic', key: 'sk-test' },
    })
    await waitFor(() => screen.getByLabelText(/title/i))
    expect(
      screen.getByRole('button', { name: /AI Draft → pin/i }),
    ).not.toBeDisabled()
    // The "add an annotation/text layer" hint should NOT show.
    expect(screen.queryByText(/to use AI Draft/i)).toBeNull()
  })

  it('disables AI Draft when there is no text signal AND no usable screenshot', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView({
      thumbnail: null,
      aiConfig: { provider: 'anthropic', key: 'sk-test' },
    })
    await waitFor(() => screen.getByLabelText(/title/i))
    expect(
      screen.getByRole('button', { name: /AI Draft → pin/i }),
    ).toBeDisabled()
    expect(screen.getByText(/to use AI Draft/i)).toBeInTheDocument()
  })

  it('re-disables AI Draft if the only signal is the image and the toggle is turned off', async () => {
    getFieldSchema.mockResolvedValue({ ok: true, status: 200, value: schema })
    renderView({
      thumbnail: new Uint8Array([1, 2, 3]),
      aiConfig: { provider: 'anthropic', key: 'sk-test' },
    })
    await waitFor(() => screen.getByLabelText(/title/i))
    const draftBtn = screen.getByRole('button', { name: /AI Draft → pin/i })
    expect(draftBtn).not.toBeDisabled()
    // Turn off "Include image" — now there's nothing to draft from.
    await userEvent.click(screen.getByRole('checkbox', { name: /include image/i }))
    expect(draftBtn).toBeDisabled()
  })
})
