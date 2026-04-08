'use client'

import * as React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  helper?: string
  error?: string
}

let inputUid = 0
function useUid(prefix: string): string {
  const ref = React.useRef<string | null>(null)
  if (ref.current === null) {
    inputUid += 1
    ref.current = `${prefix}-${inputUid}`
  }
  return ref.current
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ label, helper, error, id, className = '', ...rest }, ref) {
    const uid = useUid('ds-input')
    const inputId = id ?? uid
    const helperId = `${inputId}-helper`
    const errorId = `${inputId}-error`
    const describedBy = error ? errorId : helper ? helperId : undefined

    const classes = [
      'block w-full h-10 px-3 bg-ds-surface text-ds-fg border rounded-ds-md',
      'transition-colors focus:outline-none',
      'focus-visible:ring-2 focus-visible:ring-ds-p-500 focus-visible:border-ds-p-500',
      error ? 'border-ds-danger' : 'border-ds-border',
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-ds-sm text-ds-fg font-ds-medium">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={classes}
          {...rest}
        />
        {error ? (
          <span id={errorId} role="alert" aria-live="polite" className="text-ds-sm text-ds-danger">
            {error}
          </span>
        ) : helper ? (
          <span id={helperId} className="text-ds-sm text-ds-muted">
            {helper}
          </span>
        ) : null}
      </div>
    )
  },
)
