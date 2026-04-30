'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/igniter.client'
import { getCsrfToken } from '@/client/hooks/use-csrf-token'

interface User {
  id: string
  email: string
  name: string
  role: string // System role: 'admin' or 'user'
  organizationRole?: string // Organization role: 'master', 'manager', 'user' (only for non-admin users)
  isActive?: boolean
  isAgency?: boolean // Se true, usuário pode criar múltiplas organizações
  currentOrgId?: string | null
  organizationId?: string
  createdAt?: Date
  updatedAt?: Date
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  updateAuth: (userData: Partial<User>) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const fetchPatched = useRef(false)
  const isRefreshing = useRef(false)
  const refreshQueue = useRef<Array<() => void>>([])

  const isAuthenticated = !!user

  // Patch global fetch para injetar CSRF header e interceptar 401 com auto-refresh
  useEffect(() => {
    if (fetchPatched.current || typeof window === 'undefined') return
    fetchPatched.current = true

    const originalFetch = window.fetch.bind(window)

    const processRefreshQueue = () => {
      refreshQueue.current.forEach(cb => cb())
      refreshQueue.current = []
    }

    ;(window as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase()
      const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)

      if (isMutation) {
        const csrfToken = getCsrfToken()
        if (csrfToken) {
          const headers = new Headers(init?.headers)
          if (!headers.has('x-csrf-token')) {
            headers.set('x-csrf-token', csrfToken)
          }
          init = { ...init, headers }
        }
      }

      const response = await originalFetch(input, init)

      // Interceptar 401 em rotas de API (exceto refresh/logout para evitar loop)
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
      const isApiRoute = url.includes('/api/')
      const isAuthRoute = url.includes('/auth/refresh') || url.includes('/auth/logout')

      if (response.status === 401 && isApiRoute && !isAuthRoute) {
        if (!isRefreshing.current) {
          isRefreshing.current = true
          try {
            const refreshRes = await originalFetch('/api/v1/auth/refresh', {
              method: 'POST',
              credentials: 'include',
            })
            if (refreshRes.ok) {
              isRefreshing.current = false
              processRefreshQueue()
              // Retry a requisição original com o novo token
              return originalFetch(input, init)
            } else {
              isRefreshing.current = false
              processRefreshQueue()
              // Refresh falhou — retorna o 401 original
            }
          } catch {
            isRefreshing.current = false
            processRefreshQueue()
          }
        } else {
          // Outra requisição já está fazendo refresh — esperar
          return new Promise<Response>((resolve) => {
            refreshQueue.current.push(() => {
              resolve(originalFetch(input, init))
            })
          })
        }
      }

      return response
    }
  }, [])

  // Carregar usuário via API (cookie httpOnly enviado automaticamente)
  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await api.auth.me.query()

        if (response.data) {
          const data = response.data as any
          setUser({
            id: data.id,
            email: data.email,
            name: data.name || data.email.split('@')[0],
            role: data.role,
            currentOrgId: data.currentOrgId,
            organizationId: data.currentOrgId,
            organizationRole: data.organizationRole,
            isAgency: data.isAgency === true,
          })
        }
      } catch {
        // Silently handle auth errors (e.g. stale JWT after DB reset)
        try {
          await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' })
        } catch {
          // ignore logout errors
        }
        const publicPaths = ['/login', '/signup', '/connect', '/compartilhar', '/google-callback', '/verify', '/termos', '/privacidade']
        const isPublic = publicPaths.some(p => window.location.pathname === p || window.location.pathname.startsWith(p + '/'))
        if (!isPublic) {
          window.location.href = '/login'
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadUser()
  }, [])

  const login = async (email: string, password: string) => {
    // Login é feito via Server Action, não aqui
    console.log('Login via Server Action')
  }

  const logout = useCallback(async () => {
    try {
      await api.auth.logout.mutate({ body: { everywhere: false } })
    } catch (error) {
      console.error('[AuthProvider] Logout error:', error)
    }
    // Backend limpa cookies httpOnly via Set-Cookie (Max-Age=0).
    setUser(null)
    router.push('/login')
  }, [router])

  const refreshUser = useCallback(async () => {
    try {
      const response = await api.auth.me.query()
      if (response.data) {
        const data = response.data as any
        setUser({
          id: data.id,
          email: data.email,
          name: data.name || data.email.split('@')[0],
          role: data.role,
          currentOrgId: data.currentOrgId,
          organizationId: data.currentOrgId,
          organizationRole: data.organizationRole,
        })
      }
    } catch (error) {
      console.error('[AuthProvider] refreshUser error:', error)
    }
  }, [])

  // Auto-refresh token a cada 14 minutos (antes dos 15min de expiração)
  useEffect(() => {
    if (!user) return

    const interval = setInterval(async () => {
      try {
        await api.auth.refresh.mutate()
        await refreshUser()
      } catch {
        logout()
      }
    }, 14 * 60 * 1000)

    return () => clearInterval(interval)
  }, [user, logout, refreshUser])

  const updateAuth = (userData: Partial<User>) => {
    if (user) {
      setUser({ ...user, ...userData })
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        logout,
        refreshUser,
        updateAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
