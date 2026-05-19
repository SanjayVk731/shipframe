import React from 'react'

interface Props {
  title: string
  onOpenSettings?: () => void
}

export function ViewHeader({ title, onOpenSettings }: Props) {
  return (
    <div className="view-header">
      <h2>{title}</h2>
      {onOpenSettings && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Settings"
          title="Settings"
          onClick={onOpenSettings}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="2.25" />
            <path d="M13 8a5 5 0 0 0-.05-.7l1.4-1.07-1.4-2.42-1.65.6a5 5 0 0 0-1.2-.7L9.7 2H6.3l-.4 1.7a5 5 0 0 0-1.2.7l-1.65-.6L1.65 6.23l1.4 1.07A5 5 0 0 0 3 8a5 5 0 0 0 .05.7l-1.4 1.07 1.4 2.42 1.65-.6a5 5 0 0 0 1.2.7L6.3 14h3.4l.4-1.7a5 5 0 0 0 1.2-.7l1.65.6 1.4-2.42-1.4-1.07A5 5 0 0 0 13 8z" />
          </svg>
        </button>
      )}
    </div>
  )
}
