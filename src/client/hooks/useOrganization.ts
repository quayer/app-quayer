'use client'

export interface Organization {
  id: string
  name: string
  slug: string
  avatarUrl?: string
}

export function useCurrentOrganization() {
  return { data: null as Organization | null, isLoading: false }
}

export function useSwitchOrganization() {
  return {
    mutate: (_orgId: string) => {},
    isLoading: false,
  }
}
