'use client'

import { cn } from '@/lib/utils'

interface SkipLinkProps {
  href?: string
  className?: string
  children?: React.ReactNode
}

/**
 * Skip Link Component
 *
 * Allows keyboard users to skip to main content.
 * Appears when focused (Tab key).
 */
export function SkipLink({
  href = '#main-content',
  className,
  children = 'Pular para o conteudo principal'
}: SkipLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        // Hidden by default, visible on focus
        'sr-only focus:not-sr-only',
        // Styling when visible
        'focus:absolute focus:z-[9999] focus:top-4 focus:left-4',
        'focus:px-4 focus:py-2 focus:rounded-md',
        'focus:bg-primary focus:text-primary-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        'focus:font-medium focus:text-sm',
        'focus:shadow-lg',
        // Transition
        'transition-all duration-200',
        className
      )}
    >
      {children}
    </a>
  )
}

/**
 * Main Content Wrapper
 *
 * Use this to wrap the main content of your page.
 * This is the target of the SkipLink.
 */
export function MainContent({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn('outline-none', className)}
    >
      {children}
    </main>
  )
}
