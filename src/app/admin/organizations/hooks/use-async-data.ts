import { useState, useEffect } from 'react'

export function useAsyncData<T>(
  fetcher: (() => Promise<{ success: boolean; data: T; error?: string }>) | null,
  deps: unknown[] = []
) {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!fetcher) {
      setData(null)
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetcher().then((result) => {
      if (cancelled) return
      if (result.success) {
        setData(result.data)
      } else {
        setError(result.error || 'Erro desconhecido')
      }
    }).catch(() => {
      if (!cancelled) setError('Erro de conexão')
    }).finally(() => {
      if (!cancelled) setIsLoading(false)
    })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, isLoading, error }
}
