import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LinkedView } from '../../src/ui/views/LinkedView'

const onOpen = vi.fn()
const onUnlink = vi.fn()

beforeEach(() => {
  onOpen.mockReset()
  onUnlink.mockReset()
})

describe('LinkedView', () => {
  it('renders ticket id and provider', () => {
    render(
      <LinkedView
        link={{
          id: 'AZ-42',
          url: 'https://x/42',
          providerId: 'azure',
          createdAt: '2026-05-19T00:00:00Z',
        }}
        onOpen={onOpen}
        onUnlink={onUnlink}
      />,
    )
    expect(screen.getByText(/AZ-42/)).toBeInTheDocument()
    expect(screen.getByText(/Azure DevOps/)).toBeInTheDocument()
  })

  it('Open invokes onOpen with url', async () => {
    render(
      <LinkedView
        link={{
          id: 'AZ-42',
          url: 'https://x/42',
          providerId: 'azure',
          createdAt: '2026-05-19T00:00:00Z',
        }}
        onOpen={onOpen}
        onUnlink={onUnlink}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /open ticket/i }))
    expect(onOpen).toHaveBeenCalledWith('https://x/42')
  })

  it('Unlink requires confirm before calling onUnlink', async () => {
    render(
      <LinkedView
        link={{
          id: 'AZ-42',
          url: 'https://x/42',
          providerId: 'azure',
          createdAt: '2026-05-19T00:00:00Z',
        }}
        onOpen={onOpen}
        onUnlink={onUnlink}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^unlink$/i }))
    expect(onUnlink).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /confirm unlink/i }))
    expect(onUnlink).toHaveBeenCalled()
  })
})
