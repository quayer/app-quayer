'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IgniterProvider } from '@igniter-js/core/client'
import { ThemeProvider } from 'next-themes'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { Toaster } from '@/components/ui/sonner'
import { useState, useEffect } from 'react'

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

  // ✅ CORREÇÃO BRUTAL: Interceptar fetch globalmente
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.__fetchIntercepted) {
      const originalFetch = window.fetch
      
      window.fetch = async function(...args: any[]) {
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
        }
        
        return originalFetch(url, options)
      }
      
      window.__fetchIntercepted = true
      console.log('✅ Global fetch interceptor installed')
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
        <IgniterProvider
          options={{
            defaultOptions: {
              headers: () => {
                // ✅ CORREÇÃO BRUTAL: Injetar token em todas as requisições
                if (typeof window !== 'undefined') {
                  const token = localStorage.getItem('accessToken')
                  if (token) {
                    return {
                      'Authorization': `Bearer ${token}`,
                    }
                  }
                }
                return {}
              },
            },
          }}
        >
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </IgniterProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
