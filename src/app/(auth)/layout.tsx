import { Suspense } from 'react'

// Force dynamic rendering for all auth pages
export const dynamic = 'force-dynamic'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen bg-white dark:bg-gray-950" style={{ '--ring': 'oklch(0.708 0 0)', '--color-ring': 'var(--ring)' } as React.CSSProperties}>
      <div className="relative">
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-900 dark:text-white" role="status"><span className="sr-only">Carregando...</span><span aria-hidden="true">Carregando...</span></div>}>
          {children}
        </Suspense>
      </div>
    </div>
  )
}
