import { Suspense } from 'react'

// Force dynamic rendering for all auth pages
export const dynamic = 'force-dynamic'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-950">
      {/* Decorative radial blobs for depth */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-purple-800/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-indigo-800/15 blur-3xl" />
      </div>
      <div className="relative z-10">
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-white" role="status"><span className="sr-only">Carregando...</span><span aria-hidden="true">Carregando...</span></div>}>
          {children}
        </Suspense>
      </div>
    </div>
  )
}
