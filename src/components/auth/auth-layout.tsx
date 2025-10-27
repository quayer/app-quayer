'use client'

import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { StarsBackground } from '@/components/ui/stars-background'

interface AuthLayoutProps {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      {/* Stars Background */}
      <StarsBackground
        starDensity={0.00015}
        allStarsTwinkle={true}
        twinkleProbability={0.7}
        minTwinkleSpeed={0.5}
        maxTwinkleSpeed={1}
        className="absolute inset-0 z-0"
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black/50 to-pink-900/20 z-[1]" />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {children}
        </motion.div>
      </div>
    </div>
  )
}
