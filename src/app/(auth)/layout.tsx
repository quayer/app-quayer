import { Suspense } from 'react'
import { StarsBackground } from '@/components/ui/stars-background'

// Force dynamic rendering for all auth pages
export const dynamic = 'force-dynamic'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen bg-black">
      <StarsBackground
        starDensity={0.00015}
        allStarsTwinkle={true}
        twinkleProbability={0.7}
        minTwinkleSpeed={0.5}
        maxTwinkleSpeed={1}
        className="z-0"
      />
      <div className="relative z-10">
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-white">Carregando...</div>}>
          {children}
        </Suspense>
      </div>
    </div>
  )
}