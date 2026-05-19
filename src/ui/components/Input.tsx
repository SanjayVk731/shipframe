import React, { useId } from 'react'

interface Props {
  label: string
  value: string
  onChange: (next: string) => void
  type?: 'text' | 'password'
  placeholder?: string
  multiline?: boolean
}

export function Input({ label, value, onChange, type = 'text', placeholder, multiline }: Props) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
