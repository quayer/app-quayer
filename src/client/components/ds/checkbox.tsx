'use client'

import * as React from 'react'

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label: React.ReactNode
  error?: string
  helper?: string
}

function useUid(prefix: string): string {
  const uid = React.useId()
  return `${prefix}-${uid}`
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ label, error, helper, id, className = '', ...rest }, ref) {
    const uid = useUid('ds-checkbox')
    const inputId = id ?? uid
    const helperId = `${inputId}-helper`
    const errorId = `${inputId}-error`
    const describedBy = error ? errorId : helper ? helperId : undefined

    const wrapperClasses = ['flex items-start gap-2', className].filter(Boolean).join(' ')

    return (
      <div className={wrapperClasses}>
        <input
          {...rest}
          ref={ref}
          type="checkbox"
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            'mt-1 h-4 w-4 rounded-ds-sm border',
            error ? 'border-ds-danger' : 'border-ds-border',
            'text-ds-p-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-p-500',
          ].join(' ')}
        />
        <div className="flex-1">
          <label
            htmlFor={inputId}
            className="text-ds-sm text-ds-fg cursor-pointer select-none"
          >
            {label}
          </label>
          {error ? (
            <p
              id={errorId}
              role="alert"
              aria-live="polite"
              className="text-ds-sm text-ds-danger mt-1"
            >
              {error}
            </p>
          ) : helper ? (
            <p id={helperId} className="text-ds-sm text-ds-muted mt-1">
              {helper}
            </p>
          ) : null}
        </div>
      </div>
    )
  },
)
