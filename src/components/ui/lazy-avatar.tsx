'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { User, Users } from 'lucide-react'

interface LazyAvatarProps {
  /** Direct URL to the profile picture (if already known) */
  src?: string | null
  /** Phone number for lazy loading (if src is not available) */
  phoneNumber?: string
  /** Instance ID for fetching profile pic from API */
  instanceId?: string
  /** Name for generating fallback initials */
  name?: string | null
  /** Whether this is a group chat */
  isGroup?: boolean
  /** CSS class name */
  className?: string
  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
}

const iconSizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
}

const fallbackTextSizes = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
}

// ==================== GLOBAL THROTTLED FETCH QUEUE ====================
// Sistema de fila com throttle para evitar muitas requisições simultâneas
// Máximo de 3 requisições paralelas com delay de 100ms entre elas

type QueueItem = {
  key: string
  instanceId: string
  phoneNumber: string
  resolve: (url: string | null) => void
}

const MAX_CONCURRENT_REQUESTS = 1  // Reduced to prevent UI blocking
const REQUEST_DELAY_MS = 500       // Increased delay between requests

// Cache em memória (mais rápido que sessionStorage)
const memoryCache = new Map<string, { url: string | null; timestamp: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos

// Fila de requisições pendentes
const fetchQueue: QueueItem[] = []
let activeRequests = 0
let isProcessing = false

const processQueue = async () => {
  if (isProcessing) return
  isProcessing = true

  while (fetchQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
    const item = fetchQueue.shift()
    if (!item) continue

    // Verificar cache novamente (pode ter sido preenchido enquanto na fila)
    const cached = memoryCache.get(item.key)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      item.resolve(cached.url)
      continue
    }

    activeRequests++

    // Fazer requisição com delay para não sobrecarregar
    setTimeout(async () => {
      try {
        const cleanNumber = item.phoneNumber.replace(/@.*$/, '')
        const response = await fetch(
          `/api/v1/contacts/profile-picture?instanceId=${item.instanceId}&phoneNumber=${cleanNumber}`
        )

        if (!response.ok) {
          memoryCache.set(item.key, { url: null, timestamp: Date.now() })
          item.resolve(null)
          return
        }

        const data = await response.json()
        const url = data.data?.url || data.url || null

        memoryCache.set(item.key, { url, timestamp: Date.now() })
        item.resolve(url)
      } catch {
        memoryCache.set(item.key, { url: null, timestamp: Date.now() })
        item.resolve(null)
      } finally {
        activeRequests--
        // Continuar processando a fila
        if (fetchQueue.length > 0) {
          processQueue()
        }
      }
    }, REQUEST_DELAY_MS)
  }

  isProcessing = false
}

const fetchProfilePicThrottled = (instanceId: string, phoneNumber: string): Promise<string | null> => {
  const key = `avatar:${instanceId}:${phoneNumber}`

  // Verificar cache primeiro
  const cached = memoryCache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return Promise.resolve(cached.url)
  }

  // Verificar sessionStorage (fallback para erros persistentes)
  if (typeof window !== 'undefined') {
    const sessionCached = sessionStorage.getItem(key)
    if (sessionCached === 'error') {
      return Promise.resolve(null)
    }
  }

  // Adicionar à fila
  return new Promise((resolve) => {
    // Verificar se já está na fila
    const existing = fetchQueue.find(item => item.key === key)
    if (existing) {
      // Já está na fila, adicionar callback
      const originalResolve = existing.resolve
      existing.resolve = (url) => {
        originalResolve(url)
        resolve(url)
      }
      return
    }

    fetchQueue.push({ key, instanceId, phoneNumber, resolve })
    processQueue()
  })
}

/**
 * LazyAvatar - Avatar component with lazy loading for profile pictures
 *
 * Features:
 * - Throttled fetch queue to prevent too many simultaneous requests
 * - Memory cache with TTL for fast access
 * - SessionStorage fallback for persistent error states
 * - Graceful fallback to initials or icons
 */
export function LazyAvatar({
  src,
  phoneNumber,
  instanceId,
  name,
  isGroup = false,
  className,
  size = 'md',
}: LazyAvatarProps) {
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(src || null)
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [triedRefetch, setTriedRefetch] = useState(false)
  const mountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Track if a fetch is in progress to prevent double-fetching
  const fetchingRef = useRef(false)

  // Function to fetch profile picture from API
  const fetchFromApi = useCallback(() => {
    if (!phoneNumber || !instanceId || fetchingRef.current) return

    const cacheKey = `avatar:${instanceId}:${phoneNumber}`
    const cached = memoryCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      if (cached.url) {
        setProfilePicUrl(cached.url)
        setHasError(false)
      } else {
        setHasError(true)
      }
      return
    }

    fetchingRef.current = true
    setIsLoading(true)
    fetchProfilePicThrottled(instanceId, phoneNumber)
      .then((url) => {
        if (!mountedRef.current) return

        if (url) {
          setProfilePicUrl(url)
          setHasError(false)
        } else {
          setHasError(true)
        }
      })
      .finally(() => {
        fetchingRef.current = false
        if (mountedRef.current) {
          setIsLoading(false)
        }
      })
  }, [phoneNumber, instanceId])

  // Handle image load error - try to fetch fresh URL from API
  const handleImageError = useCallback(() => {
    // If we have a src that's a WhatsApp CDN URL (not base64), try to fetch fresh
    if (src && !src.startsWith('data:') && !triedRefetch && phoneNumber && instanceId) {
      setTriedRefetch(true)
      // Clear the invalid src and fetch fresh from API
      setProfilePicUrl(null)
      fetchFromApi()
    } else {
      setHasError(true)
    }
  }, [src, triedRefetch, phoneNumber, instanceId, fetchFromApi])

  // Initial load: use src if available, otherwise fetch from API
  useEffect(() => {
    // Reset state when src changes
    setTriedRefetch(false)

    if (src) {
      // If it's base64, use directly (won't expire)
      if (src.startsWith('data:')) {
        setProfilePicUrl(src)
        setHasError(false)
        return
      }

      // It's a CDN URL - check cache first for base64 version
      if (phoneNumber && instanceId) {
        const cacheKey = `avatar:${instanceId}:${phoneNumber}`
        const cached = memoryCache.get(cacheKey)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.url?.startsWith('data:')) {
          // We have a cached base64 version, use it instead of CDN URL
          setProfilePicUrl(cached.url)
          setHasError(false)
          return
        }
      }

      // Use the CDN URL (might be expired, will retry on error)
      setProfilePicUrl(src)
      setHasError(false)
      return
    }

    // TEMPORARILY DISABLED: Don't auto-fetch to debug scroll issue
    // If scroll works without this, the problem is profile pic fetching
    // if (!phoneNumber || !instanceId) return
    // fetchFromApi()
  }, [src, phoneNumber, instanceId, fetchFromApi])

  // Generate initials from name - memoized
  const initials = useMemo(() => {
    if (!name) return null
    const parts = name.trim().split(' ').filter(Boolean)
    if (parts.length === 0) return null
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || null
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }, [name])

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {profilePicUrl && !hasError && (
        <AvatarImage
          src={profilePicUrl}
          alt={name || 'Profile'}
          onError={handleImageError}
        />
      )}
      <AvatarFallback
        className={cn(
          'bg-primary/10 text-primary',
          fallbackTextSizes[size],
          isLoading && 'animate-pulse'
        )}
      >
        {isGroup ? (
          <Users className={iconSizeClasses[size]} />
        ) : initials ? (
          initials
        ) : (
          <User className={iconSizeClasses[size]} />
        )}
      </AvatarFallback>
    </Avatar>
  )
}

export default LazyAvatar
