import React, { useState } from 'react'
import { Button } from '../components/Button'
import { ViewHeader } from '../components/ViewHeader'
import type { TicketLink } from '../../shared/types'

interface Props {
  link: TicketLink
  /** When set and equal to `link.id`, render a "Ticket created" success banner. */
  justCreated?: boolean
  /** Shown alongside the success banner when the thumbnail upload failed. */
  attachmentFailed?: boolean
  /** Show "pin couldn't be added" warning. */
  pinFailed?: boolean
  onOpen: (url: string) => void
  onFocus: () => void
  onUnlink: () => void
  onOpenSettings: () => void
}

function providerLabel(id: TicketLink['providerId']): string {
  return id === 'notion' ? 'Notion' : 'Azure DevOps'
}

export function LinkedView({
  link,
  justCreated = false,
  attachmentFailed = false,
  pinFailed = false,
  onOpen,
  onFocus,
  onUnlink,
  onOpenSettings,
}: Props) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div>
      <ViewHeader title="Linked" onOpenSettings={onOpenSettings} />
      {justCreated && (
        <div className="success-banner" role="status">
          Ticket created.{' '}
          <a href={link.url} onClick={(e) => { e.preventDefault(); onOpen(link.url) }}>
            Open {link.id}
          </a>
        </div>
      )}
      {justCreated && attachmentFailed && (
        <div className="warning-banner" role="alert">
          Thumbnail couldn't be attached. The ticket was created without it.
        </div>
      )}
      {justCreated && pinFailed && (
        <div className="warning-banner" role="alert">
          Pin couldn't be added to the frame. The ticket was created.
        </div>
      )}
      <p>
        Ticket <strong>{link.id}</strong> on {providerLabel(link.providerId)}
      </p>
      <div className="row">
        <Button variant="primary" onClick={() => onOpen(link.url)}>
          Open ticket
        </Button>
        <Button onClick={onFocus}>Focus in Figma</Button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {!confirming ? (
          <Button onClick={() => setConfirming(true)}>Unlink</Button>
        ) : (
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setConfirming(false)
                onUnlink()
              }}
            >
              Confirm unlink
            </Button>
          </>
        )}
      </div>
      {confirming && (
        <p style={{ marginTop: 8, opacity: 0.7 }}>
          Unlink only removes the link in Figma. The ticket itself is not deleted.
        </p>
      )}
    </div>
  )
}
