'use client'

import { useState, useEffect } from 'react'
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

/**
 * LazyAvatar - Avatar component with lazy loading for profile pictures
 *
 * If src is provided, uses it directly.
 * If only phoneNumber and instanceId are provided, fetches from API.
 * Falls back to initials or icons.
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

  // Lazy load profile picture when we don't have src but have phoneNumber
  useEffect(() => {
    if (src) {
      setProfilePicUrl(src)
      setHasError(false)
      return
    }

    if (!phoneNumber || !instanceId) return

    // Check if we already tried and failed
    const cacheKey = `avatar:${instanceId}:${phoneNumber}`
    const cachedError = sessionStorage.getItem(cacheKey)
    if (cachedError === 'error') {
      setHasError(true)
      return
    }

    const fetchProfilePic = async () => {
      setIsLoading(true)
      try {
        const cleanNumber = phoneNumber.replace(/@.*$/, '')
        const response = await fetch(
          `/api/v1/contacts/profile-picture?instanceId=${instanceId}&phoneNumber=${cleanNumber}`
        )

        if (!response.ok) {
          sessionStorage.setItem(cacheKey, 'error')
          setHasError(true)
          return
        }

        const data = await response.json()
        const url = data.data?.url || data.url || null

        if (url) {
          setProfilePicUrl(url)
          setHasError(false)
        } else {
          sessionStorage.setItem(cacheKey, 'error')
          setHasError(true)
        }
      } catch {
        sessionStorage.setItem(cacheKey, 'error')
        setHasError(true)
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfilePic()
  }, [src, phoneNumber, instanceId])

  // Generate initials from name
  const getInitials = () => {
    if (!name) return null
    const parts = name.trim().split(' ').filter(Boolean)
    if (parts.length === 0) return null
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || null
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  const initials = getInitials()

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
