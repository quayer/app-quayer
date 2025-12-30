'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
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

const MAX_CONCURRENT_REQUESTS = 3
const REQUEST_DELAY_MS = 100

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
  const mountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Lazy load profile picture when we don't have src but have phoneNumber
  useEffect(() => {
    if (src) {
      setProfilePicUrl(src)
      setHasError(false)
      return
    }

    if (!phoneNumber || !instanceId) return

    // Check memory cache first
    const cacheKey = `avatar:${instanceId}:${phoneNumber}`
    const cached = memoryCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      if (cached.url) {
        setProfilePicUrl(cached.url)
      } else {
        setHasError(true)
      }
      return
    }

    // Fetch via throttled queue
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
        if (mountedRef.current) {
          setIsLoading(false)
        }
      })
  }, [src, phoneNumber, instanceId])

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
          onError={() => setHasError(true)}
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
