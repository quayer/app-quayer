import * as React from 'react'
import { cn } from '@/lib/utils'

const Field = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('space-y-2', className)} {...props} />
)
Field.displayName = 'Field'

const FieldLabel = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)} {...props} />
  )
)
FieldLabel.displayName = 'FieldLabel'

const FieldDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
)
FieldDescription.displayName = 'FieldDescription'

const FieldGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex flex-col gap-1', className)} {...props} />
)
FieldGroup.displayName = 'FieldGroup'

const FieldSeparator = React.forwardRef<HTMLHRElement, React.HTMLAttributes<HTMLHRElement>>(
  ({ className, ...props }, ref) => <hr ref={ref} className={cn('border-border', className)} {...props} />
)
FieldSeparator.displayName = 'FieldSeparator'

const FieldError = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm font-medium text-destructive', className)} {...props} />
  )
)
FieldError.displayName = 'FieldError'

export { Field, FieldLabel, FieldDescription, FieldGroup, FieldSeparator, FieldError }
