import React, { useState } from 'react'
import { Button } from '../components/Button'
import type { TicketLink } from '../../shared/types'

interface Props {
  link: TicketLink
  onOpen: (url: string) => void
  onUnlink: () => void
}

function providerLabel(id: TicketLink['providerId']): string {
  return id === 'notion' ? 'Notion' : 'Azure DevOps'
}

export function LinkedView({ link, onOpen, onUnlink }: Props) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div>
      <h2>Linked</h2>
      <p>
        Ticket <strong>{link.id}</strong> on {providerLabel(link.providerId)}
      </p>
      <div className="row">
        <Button variant="primary" onClick={() => onOpen(link.url)}>
          Open ticket
        </Button>
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
