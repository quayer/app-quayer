'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IgniterProvider } from '@igniter-js/core/client'
import { ThemeProvider } from 'next-themes'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { Toaster } from '@/client/components/ui/sonner'
import { useState, useEffect } from 'react'

// Extend Window to include our custom property
declare global {
  interface Window {
    __fetchIntercepted?: boolean
  }
}

/**
 * @component AppProviders
 * @description Combines all application providers (React Query + Igniter.js + Auth + Theme)
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  // Create QueryClient instance (once per component lifecycle)
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        refetchOnWindowFocus: false,
      },
    },
  }))

  // Interceptar fetch para incluir credentials: 'include' em chamadas API
  // Isso garante que cookies httpOnly são enviados automaticamente
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.__fetchIntercepted) {
      const originalFetch = window.fetch.bind(window)

      ;(window as any).fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url

        // Incluir credentials para enviar cookies httpOnly automaticamente
        if (url.includes('/api/v1')) {
          init = {
            ...init,
            credentials: init?.credentials || 'include',
          }
        }

        return originalFetch(input, init)
      }

      window.__fetchIntercepted = true
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        disableTransitionOnChange
      >
        <IgniterProvider>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </IgniterProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
