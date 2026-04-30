import { Suspense } from 'react'
import { DM_Sans, DM_Mono } from 'next/font/google'

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm-sans',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
  variable: '--font-dm-mono',
})

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-auth-v3="true"
      className={`${dmSans.variable} ${dmMono.variable} min-h-screen`}
    >
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen" role="status">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
              <span className="text-sm text-gray-500">Carregando...</span>
            </div>
          </div>
        }
      >
        {children}
      </Suspense>
    </div>
  )
}
