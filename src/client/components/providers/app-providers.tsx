'use client'

import * as React from 'react'
import { ThemeProvider } from 'next-themes'
import { AuthProvider } from '@/lib/auth/auth-provider'

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  )
}
