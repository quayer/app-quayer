import * as React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, className = '', ...rest },
  ref,
) {
  const classes = [
    'rounded-ds-md shadow-ds-sm bg-ds-bg p-6',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div ref={ref} className={classes} {...rest}>
      {children}
    </div>
  )
})
