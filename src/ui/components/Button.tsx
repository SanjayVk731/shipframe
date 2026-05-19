import React from 'react'

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'default'
}

export function Button({ variant = 'default', className, ...rest }: Props) {
  const cls = ['btn', variant === 'primary' ? 'btn-primary' : '', className]
    .filter(Boolean)
    .join(' ')
  return <button className={cls} {...rest} />
}
