import React from 'react'

interface Props {
  label: string
  value: string
  onChange: (next: string) => void
  type?: 'text' | 'password'
  placeholder?: string
  multiline?: boolean
}

export function Input({ label, value, onChange, type = 'text', placeholder, multiline }: Props) {
  return (
    <div className="field">
      <label>{label}</label>
      {multiline ? (
        <textarea
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
