'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  email: string
  name: string
  role: string // System role: 'admin' or 'user'
  organizationRole?: string // Organization role: 'master', 'manager', 'user' (only for non-admin users)
  isActive?: boolean
  currentOrgId?: string | null
  organizationId?: string
  emailVerified?: Date | string | null // Email verification timestamp
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

// Função para decodificar JWT e verificar expiração
function parseJwt(token: string): any {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch (e) {
    return null
  }
}

// Verificar se o token expirou
function isTokenExpired(payload: any): boolean {
  if (!payload || !payload.exp) return true
  // exp é em segundos, Date.now() é em milissegundos
  const expirationTime = payload.exp * 1000
  const now = Date.now()
  // Considerar expirado se faltar menos de 1 minuto
  return now >= expirationTime - 60000
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  const isAuthenticated = !!user

  // Carregar usuário do token ao montar
  useEffect(() => {
    const loadUserFromToken = () => {
      try {
        // Tentar pegar do localStorage primeiro
        let token = localStorage.getItem('accessToken')

        // Se não encontrou no localStorage, tentar pegar do cookie
        if (!token) {
          const cookies = document.cookie.split(';')
          const accessTokenCookie = cookies.find(c => c.trim().startsWith('accessToken='))
          if (accessTokenCookie) {
            token = accessTokenCookie.split('=')[1]
            // Salvar no localStorage para próximas requisições
            if (token) {
              localStorage.setItem('accessToken', token)
              console.log('[AuthProvider] Token copiado do cookie para localStorage')
            }
          }
        }

        if (token) {
          const payload = parseJwt(token)
          console.log('[AuthProvider] JWT Payload:', payload)

          // Verificar se o token expirou
          if (isTokenExpired(payload)) {
            console.log('[AuthProvider] Token expired, clearing auth')
            localStorage.removeItem('accessToken')
            localStorage.removeItem('refreshToken')
            document.cookie = 'accessToken=; path=/; max-age=0'
            document.cookie = 'refreshToken=; path=/; max-age=0'
            setUser(null)
            // Redirecionar para login se não estiver em página pública
            const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password']
            if (!publicPaths.some(p => window.location.pathname.startsWith(p))) {
              window.location.href = '/login?expired=true'
            }
            return
          }

          if (payload && payload.userId) {
            const userData = {
              id: payload.userId,
              email: payload.email,
              name: payload.name || payload.email.split('@')[0],
              role: payload.role, // System role: 'admin' or 'user'
              currentOrgId: payload.currentOrgId,
              organizationId: payload.currentOrgId,
              organizationRole: payload.organizationRole, // Organization role: 'master', 'manager', 'user'
            }
            console.log('[AuthProvider] Setting user:', userData)
            setUser(userData)
          }
        } else {
          console.log('[AuthProvider] No token found in localStorage or cookies')
        }
      } catch (error) {
        console.error('Error loading user from token:', error)
      } finally {
        // Delay para garantir que localStorage foi sincronizado
        setTimeout(() => {
          setIsLoading(false)
          console.log('[AuthProvider] Auth initialization complete')
        }, 300)
      }
    }

    loadUserFromToken()
  }, [])

  const login = async (email: string, password: string) => {
    // Login é feito via Server Action, não aqui
    console.log('Login via Server Action')
  }

  const logout = async () => {
    setUser(null)
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    document.cookie = 'accessToken=; path=/; max-age=0'
    document.cookie = 'refreshToken=; path=/; max-age=0'
    router.push('/login')
  }

  const refreshUser = async () => {
    // Recarregar do token
    const token = localStorage.getItem('accessToken')
    if (token) {
      const payload = parseJwt(token)
      if (payload && payload.userId) {
        setUser({
          id: payload.userId,
          email: payload.email,
          name: payload.name || payload.email.split('@')[0],
          role: payload.role,
          currentOrgId: payload.currentOrgId,
          organizationId: payload.currentOrgId,
        })
      }
    }
  }

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
