'use client'

import * as React from 'react'

export interface AuthUser {
  id: string
  email: string
  name: string
  avatarUrl?: string
  currentOrgId?: string
  role?: string
  organizationRole?: string
  isAgency?: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  logout: () => Promise<void>
  isLoading: boolean
}

const AuthContext = React.createContext<AuthContextValue>({
  user: null,
  logout: async () => {},
  isLoading: false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthContext.Provider value={{ user: null, logout: async () => {}, isLoading: false }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  return React.useContext(AuthContext)
}
