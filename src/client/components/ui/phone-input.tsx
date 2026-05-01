'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface PhoneInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  defaultCountry?: string
  onPhoneChange?: (value: string) => void
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, defaultCountry: _defaultCountry, onPhoneChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e)
      onPhoneChange?.(e.target.value)
    }
    return (
      <input
        ref={ref}
        type="tel"
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        onChange={handleChange}
        {...props}
      />
    )
  }
)
PhoneInput.displayName = 'PhoneInput'

export { PhoneInput }
