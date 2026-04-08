import * as React from 'react'

export interface LogoProps {
  size?: number
  className?: string
  'aria-label'?: string
}

export function Logo({
  size = 32,
  className,
  'aria-label': ariaLabel,
}: LogoProps): React.ReactElement {
  const titleId = ariaLabel ? 'ds-logo-title' : undefined
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={ariaLabel ? 'img' : undefined}
      aria-hidden={ariaLabel ? undefined : true}
      aria-labelledby={titleId}
    >
      {ariaLabel ? <title id={titleId}>{ariaLabel}</title> : null}
      <defs>
        <linearGradient id="ds-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--ds-p-400, #6366f1)" />
          <stop offset="100%" stopColor="var(--ds-p-700, #4338ca)" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#ds-logo-gradient)" />
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fontSize="32"
        fontWeight="700"
        fill="#ffffff"
        fontFamily="system-ui, sans-serif"
      >
        Q
      </text>
    </svg>
  )
}
