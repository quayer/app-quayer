'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

// In-memory cache for profile pictures to avoid excessive API calls
const profilePicCache = new Map<string, { url: string | null; timestamp: number }>()
const CACHE_TTL = 1000 * 60 * 30 // 30 minutes

interface UseProfilePictureOptions {
  instanceId?: string
  phoneNumber?: string
  fallbackUrl?: string | null
  enabled?: boolean
}

/**
 * Hook to fetch and cache WhatsApp profile pictures
 * Uses lazy loading - only fetches when the profile pic is not in cache
 */
export function useProfilePicture({
  instanceId,
  phoneNumber,
  fallbackUrl,
  enabled = true,
}: UseProfilePictureOptions) {
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(fallbackUrl || null)
  const queryClient = useQueryClient()

  // Check if we have a valid cached value
  const getCachedUrl = useCallback(() => {
    if (!phoneNumber) return null
    const cached = profilePicCache.get(phoneNumber)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.url
    }
    return null
  }, [phoneNumber])

  // Query to fetch profile picture
  const { data: fetchedUrl } = useQuery({
    queryKey: ['profilePicture', instanceId, phoneNumber],
    queryFn: async () => {
      if (!instanceId || !phoneNumber) return null

      // Clean phone number
      const cleanNumber = phoneNumber.replace(/@.*$/, '')

      try {
        const response = await fetch(
          `/api/v1/contacts/profile-picture?instanceId=${instanceId}&phoneNumber=${cleanNumber}`
        )

        if (!response.ok) {
          // Cache null to avoid repeated failed requests
          profilePicCache.set(phoneNumber, { url: null, timestamp: Date.now() })
          return null
        }

        const data = await response.json()
        const url = data.data?.url || data.url || null

        // Cache the result
        profilePicCache.set(phoneNumber, { url, timestamp: Date.now() })

        return url
      } catch {
        // Cache null on error
        profilePicCache.set(phoneNumber, { url: null, timestamp: Date.now() })
        return null
      }
    },
    enabled: enabled && !!instanceId && !!phoneNumber && !getCachedUrl() && !fallbackUrl,
    staleTime: CACHE_TTL,
    retry: false,
    refetchOnWindowFocus: false,
  })

  // Update profile pic URL when we have a cached value or fetched value
  useEffect(() => {
    const cached = getCachedUrl()
    if (cached) {
      setProfilePicUrl(cached)
    } else if (fetchedUrl) {
      setProfilePicUrl(fetchedUrl)
    } else if (fallbackUrl) {
      setProfilePicUrl(fallbackUrl)
    }
  }, [getCachedUrl, fetchedUrl, fallbackUrl])

  // Prefetch function for batch loading
  const prefetch = useCallback(
    async (contacts: Array<{ phoneNumber: string; instanceId?: string }>) => {
      const toFetch = contacts.filter(
        (c) => c.phoneNumber && !profilePicCache.has(c.phoneNumber)
      )

      // Fetch in batches of 5
      for (let i = 0; i < toFetch.length; i += 5) {
        const batch = toFetch.slice(i, i + 5)
        await Promise.all(
          batch.map((contact) =>
            queryClient.prefetchQuery({
              queryKey: ['profilePicture', contact.instanceId || instanceId, contact.phoneNumber],
              queryFn: async () => {
                const cleanNumber = contact.phoneNumber.replace(/@.*$/, '')
                try {
                  const response = await fetch(
                    `/api/v1/contacts/profile-picture?instanceId=${contact.instanceId || instanceId}&phoneNumber=${cleanNumber}`
                  )
                  if (!response.ok) return null
                  const data = await response.json()
                  const url = data.data?.url || data.url || null
                  profilePicCache.set(contact.phoneNumber, { url, timestamp: Date.now() })
                  return url
                } catch {
                  return null
                }
              },
              staleTime: CACHE_TTL,
            })
          )
        )
      }
    },
    [instanceId, queryClient]
  )

  return {
    profilePicUrl,
    isLoading: !profilePicUrl && enabled && !!instanceId && !!phoneNumber,
    prefetch,
  }
}

/**
 * Clear expired cache entries
 */
export function clearExpiredProfilePicCache() {
  const now = Date.now()
  for (const [key, value] of profilePicCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      profilePicCache.delete(key)
    }
  }
}

/**
 * Force clear all cached profile pictures
 */
export function clearAllProfilePicCache() {
  profilePicCache.clear()
}
