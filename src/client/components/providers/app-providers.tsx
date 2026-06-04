'use client'

import * as React from 'react'
import { IgniterProvider } from '@igniter-js/core/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { TooltipProvider } from '@/client/components/ui/tooltip'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <TooltipProvider delayDuration={200}>
        <QueryClientProvider client={queryClient}>
          <IgniterProvider enableRealtime={false}>
            <AuthProvider>{children}</AuthProvider>
          </IgniterProvider>
        </QueryClientProvider>
      </TooltipProvider>
    </ThemeProvider>
  )
}
