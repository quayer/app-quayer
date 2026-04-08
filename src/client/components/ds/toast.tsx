'use client'

import * as React from 'react'

export type ToastType = 'info' | 'success' | 'error' | 'warning'

export interface ToastProps {
  type: ToastType
  message: string
  onDismiss?: () => void
  className?: string
}

const typeClasses: Record<ToastType, string> = {
  info: 'bg-ds-info-bg text-ds-info-fg border-ds-info',
  success: 'bg-ds-success-bg text-ds-success-fg border-ds-success',
  error: 'bg-ds-danger-bg text-ds-danger-fg border-ds-danger',
  warning: 'bg-ds-warning-bg text-ds-warning-fg border-ds-warning',
}

export function Toast({
  type,
  message,
  onDismiss,
  className = '',
}: ToastProps): React.ReactElement {
  const role = type === 'error' || type === 'warning' ? 'alert' : 'status'
  const ariaLive = role === 'alert' ? 'assertive' : 'polite'

  const classes = [
    'flex items-start justify-between gap-3 p-4 rounded-ds-md shadow-ds-sm border',
    typeClasses[type],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div role={role} aria-live={ariaLive} className={classes}>
      <span className="text-ds-sm">{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="text-ds-sm font-ds-medium hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-p-500 rounded-ds-sm"
        >
          x
        </button>
      ) : null}
    </div>
  )
}
