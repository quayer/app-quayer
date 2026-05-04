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

const FieldSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, className, ...props }, ref) => (
    <div
      ref={ref}
      role="separator"
      className={cn('flex items-center gap-3 text-xs uppercase text-muted-foreground', className)}
      {...props}
    >
      <div className="h-px flex-1 border-t border-border" />
      {children ? <span className="shrink-0">{children}</span> : null}
      <div className="h-px flex-1 border-t border-border" />
    </div>
  )
)
FieldSeparator.displayName = 'FieldSeparator'

const FieldError = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm font-medium text-destructive', className)} {...props} />
  )
)
FieldError.displayName = 'FieldError'

export { Field, FieldLabel, FieldDescription, FieldGroup, FieldSeparator, FieldError }
