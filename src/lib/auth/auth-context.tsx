'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/igniter.client'

interface User {
  id: string
  email: string
  name: string
  role: string
  currentOrgId?: string | null
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Carregar usuário do localStorage/API ao montar
  useEffect(() => {
    loadUser()
  }, [])

  const loadUser = async () => {
    try {
      setIsLoading(true)
      const accessToken = localStorage.getItem('accessToken')

      if (!accessToken) {
        setUser(null)
        return
      }

      // Buscar dados do usuário
      const response = await api.auth.me.query()

      if (response.data) {
        setUser(response.data as User)
      }
    } catch (error) {
      console.error('Erro ao carregar usuário:', error)
      // Token inválido, limpar
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.auth.login.mutate({
      body: { email, password }
    })

    if (response.data?.accessToken) {
      // Salvar tokens
      localStorage.setItem('accessToken', response.data.accessToken)
      if (response.data.refreshToken) {
        localStorage.setItem('refreshToken', response.data.refreshToken)
      }

      // Salvar no cookie para middleware
      document.cookie = `accessToken=${response.data.accessToken}; path=/; max-age=${15 * 60}; SameSite=Lax`

      // Atualizar estado
      setUser(response.data.user as User)

      // Redirecionar baseado no role
      const userRole = response.data.user?.role
      if (userRole === 'admin') {
        router.push('/admin')
      } else {
        router.push('/integracoes')
      }
      router.refresh()
    }
  }, [router])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout.mutate({
        body: { type: 'partial' }
      })
    } catch (error) {
      console.error('Erro ao fazer logout:', error)
    } finally {
      // Limpar tokens
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      document.cookie = 'accessToken=; path=/; max-age=0'

      // Limpar estado
      setUser(null)

      // Redirecionar
      router.push('/login')
      router.refresh()
    }
  }, [router])

  const refreshSession = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken')
      if (!refreshToken) {
        throw new Error('No refresh token')
      }

      const response = await api.auth.refresh.mutate({
        body: { refreshToken }
      })

      if (response.data?.accessToken) {
        localStorage.setItem('accessToken', response.data.accessToken)
        document.cookie = `accessToken=${response.data.accessToken}; path=/; max-age=${15 * 60}; SameSite=Lax`

        // Recarregar usuário
        await loadUser()
      }
    } catch (error) {
      console.error('Erro ao renovar sessão:', error)
      logout()
    }
  }, [logout])

  // Auto-refresh token a cada 14 minutos (antes dos 15min de expiração)
  useEffect(() => {
    if (!user) return

    const interval = setInterval(() => {
      refreshSession()
    }, 14 * 60 * 1000) // 14 minutos

    return () => clearInterval(interval)
  }, [user, refreshSession])

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshSession,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
