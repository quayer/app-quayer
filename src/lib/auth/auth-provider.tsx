'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

export interface AuthUser {
  id: string
  email: string
  name: string
  avatarUrl?: string
  currentOrgId?: string
  role?: string
  organizationRole?: string
  isAgency?: boolean
  organizations?: Array<{
    id: string
    name: string
    slug: string
    role: string
  }>
}

interface AuthContextValue {
  user: AuthUser | null
  logout: () => Promise<void>
  isLoading: boolean
  refetch: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue>({
  user: null,
  logout: async () => {},
  isLoading: false,
  refetch: async () => {},
})

interface MeResponse {
  data?: {
    id: string
    email: string
    name: string
    role?: string
    avatarUrl?: string | null
    currentOrgId?: string | null
    isAgency?: boolean
    organizations?: Array<{
      id: string
      name: string
      slug: string
      role: string
    }>
  }
  error?: string
}

function mapMeResponseToAuthUser(payload: MeResponse): AuthUser | null {
  const data = payload?.data
  if (!data?.id) return null
  const orgs = data.organizations ?? []
  const currentOrg = data.currentOrgId
    ? orgs.find((o) => o.id === data.currentOrgId)
    : undefined
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    avatarUrl: data.avatarUrl ?? undefined,
    currentOrgId: data.currentOrgId ?? undefined,
    role: data.role,
    organizationRole: currentOrg?.role,
    isAgency: data.isAgency,
    organizations: orgs,
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = React.useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  const fetchMe = React.useCallback(async () => {
    try {
      const res = await fetch('/api/v1/auth/me', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        setUser(null)
        return
      }
      const json = (await res.json()) as MeResponse
      setUser(mapMeResponseToAuthUser(json))
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void fetchMe()
  }, [fetchMe])

  const logout = React.useCallback(async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    } catch {
      // ignore network errors — cookie may still be cleared client-side
    }
    setUser(null)
    router.push('/login')
    router.refresh()
  }, [router])

  const value = React.useMemo(
    () => ({ user, logout, isLoading, refetch: fetchMe }),
    [user, logout, isLoading, fetchMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  return React.useContext(AuthContext)
}
