import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LinkedView } from '../../src/ui/views/LinkedView'

const onOpen = vi.fn()
const onFocus = vi.fn()
const onUnlink = vi.fn()

const link = {
  id: 'AZ-42',
  url: 'https://x/42',
  providerId: 'azure' as const,
  createdAt: '2026-05-19T00:00:00Z',
}

beforeEach(() => {
  onOpen.mockReset()
  onFocus.mockReset()
  onUnlink.mockReset()
})

function renderView() {
  return render(
    <LinkedView
      link={link}
      onOpen={onOpen}
      onFocus={onFocus}
      onUnlink={onUnlink}
    />,
  )
}

describe('LinkedView', () => {
  it('renders ticket id and provider', () => {
    renderView()
    expect(screen.getByText(/AZ-42/)).toBeInTheDocument()
    expect(screen.getByText(/Azure DevOps/)).toBeInTheDocument()
  })

  it('Open invokes onOpen with url', async () => {
    renderView()
    await userEvent.click(screen.getByRole('button', { name: /open ticket/i }))
    expect(onOpen).toHaveBeenCalledWith('https://x/42')
  })

  it('Focus invokes onFocus', async () => {
    renderView()
    await userEvent.click(screen.getByRole('button', { name: /focus in figma/i }))
    expect(onFocus).toHaveBeenCalled()
  })

  it('Unlink requires confirm before calling onUnlink', async () => {
    renderView()
    await userEvent.click(screen.getByRole('button', { name: /^unlink$/i }))
    expect(onUnlink).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /confirm unlink/i }))
    expect(onUnlink).toHaveBeenCalled()
  })
})
