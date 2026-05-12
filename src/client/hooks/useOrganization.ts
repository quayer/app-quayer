'use client'

import { useCallback, useState } from 'react'
import { useAuth } from '@/lib/auth/auth-provider'

export interface Organization {
  id: string
  name: string
  slug: string
  role?: string
  avatarUrl?: string
}

interface OrgQueryResult {
  data: Organization | null
  isLoading: boolean
}

/**
 * Returns the current organization derived from the authenticated user's
 * organizations array + currentOrgId. No extra fetch — uses AuthProvider state.
 */
export function useCurrentOrganization(): OrgQueryResult {
  const { user, isLoading } = useAuth()
  if (!user?.currentOrgId) return { data: null, isLoading }
  const current = user.organizations?.find((o) => o.id === user.currentOrgId)
  if (!current) return { data: null, isLoading }
  return {
    data: {
      id: current.id,
      name: current.name,
      slug: current.slug,
      role: current.role,
    },
    isLoading,
  }
}

/**
 * Switches the active organization via PATCH /api/v1/auth/me (currentOrgId)
 * and reloads auth context so the sidebar reflects the change immediately.
 */
export function useSwitchOrganization() {
  const { refetch } = useAuth()
  const [isPending, setIsPending] = useState(false)

  const mutate = useCallback(
    async (organizationId: string) => {
      setIsPending(true)
      try {
        await fetch('/api/v1/auth/me', {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentOrgId: organizationId }),
        })
        await refetch()
      } finally {
        setIsPending(false)
      }
    },
    [refetch],
  )

  return { mutate, isLoading: isPending }
}
