'use client'

import * as React from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-ds-p-500 text-ds-on-primary hover:bg-ds-p-600 focus-visible:ring-ds-p-500',
  secondary:
    'bg-ds-surface text-ds-fg border border-ds-border hover:bg-ds-surface-hover focus-visible:ring-ds-p-500',
  ghost:
    'bg-transparent text-ds-fg hover:bg-ds-surface-hover focus-visible:ring-ds-p-500',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-ds-sm rounded-ds-sm',
  md: 'h-10 px-4 text-ds-base rounded-ds-md',
  lg: 'h-12 px-6 text-ds-lg rounded-ds-md',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      className = '',
      children,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    const isDisabled = disabled || loading
    const classes = [
      'inline-flex items-center justify-center gap-2 font-ds-medium transition-colors',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      variantClasses[variant],
      sizeClasses[size],
      loading ? 'pointer-events-none' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={classes}
        {...rest}
      >
        {loading ? (
          <span
            data-testid="ds-button-spinner"
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : null}
        {children}
      </button>
    )
  },
)
