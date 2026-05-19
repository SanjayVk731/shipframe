import React from 'react'

interface Props {
  message: string
  onRetry?: () => void
}

export function ErrorBanner({ message, onRetry }: Props) {
  return (
    <div className="banner" role="alert">
      <div>{message}</div>
      {onRetry && (
        <button className="btn" onClick={onRetry} style={{ marginTop: 6 }}>
          Retry
        </button>
      )}
    </div>
  )
}
