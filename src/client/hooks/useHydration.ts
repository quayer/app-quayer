/**
 * useHydration Hook
 *
 * Simple hook to detect client-side hydration completion.
 * Eliminates the repeated useState/useEffect isMounted pattern
 * found throughout the codebase.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const isHydrated = useHydration()
 *
 *   if (!isHydrated) {
 *     return <Skeleton />
 *   }
 *
 *   return <ActualContent />
 * }
 * ```
 */

import { useState, useEffect } from 'react'

export function useHydration(): boolean {
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  return isHydrated
}
