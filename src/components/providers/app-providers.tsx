'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IgniterProvider } from '@igniter-js/core/client'
import { ThemeProvider } from 'next-themes'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { Toaster } from '@/components/ui/sonner'
import { CommandPalette } from '@/components/command-palette'
import { SkipLink } from '@/components/accessibility/skip-link'
import { useState, useLayoutEffect } from 'react'

// ✅ CORREÇÃO: Instalar interceptor imediatamente (fora do componente, mas apenas no cliente)
if (typeof window !== 'undefined') {
  const win = window as any
  if (!win.__fetchIntercepted) {
    const originalFetch = win.fetch

    win.fetch = async function(...args: any[]) {
      const [url, options = {}] = args

      // Adicionar token automaticamente em requisições para /api/v1
      if (typeof url === 'string' && url.includes('/api/v1')) {
        const token = localStorage.getItem('accessToken')

        if (token) {
          options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
          }
        }

        // ✅ CORREÇÃO: Sempre incluir credentials para enviar cookies
        options.credentials = options.credentials || 'include'
      }

      return originalFetch(url, options)
    }

    win.__fetchIntercepted = true
    console.log('✅ Global fetch interceptor installed (immediate)')
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

  // ✅ Garantir que o interceptor está instalado no layout effect (mais cedo que useEffect)
  useLayoutEffect(() => {
    const win = window as any
    if (!win.__fetchIntercepted) {
      const originalFetch = win.fetch

      win.fetch = async function(...args: any[]) {
        const [url, options = {}] = args

        if (typeof url === 'string' && url.includes('/api/v1')) {
          const token = localStorage.getItem('accessToken')
          if (token) {
            options.headers = {
              ...options.headers,
              'Authorization': `Bearer ${token}`,
            }
          }
          options.credentials = options.credentials || 'include'
        }

        return originalFetch(url, options)
      }

      win.__fetchIntercepted = true
      console.log('✅ Global fetch interceptor installed (layoutEffect)')
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <IgniterProvider>
          <AuthProvider>
            <SkipLink />
            {children}
            <Toaster />
            <CommandPalette />
          </AuthProvider>
        </IgniterProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
