'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCsrfHeaders } from '@/client/hooks/use-csrf-token'
import {
  PROVIDERS,
  emptyRecords,
  type ProviderKey,
  type ProviderRecord,
} from './providers-catalog'

/**
 * Forma do que `/api/v1/providers` retorna. Cada item representa um
 * registro em `OrganizationProvider` (ou ausência, marcada por
 * isConfigured=false). Datas viajam como ISO strings.
 */
interface ProviderApiItem {
  provider: ProviderKey
  isConfigured: boolean
  lastFour: string | null
  updatedAt: string | null
}

function unwrap(value: unknown): ProviderApiItem[] {
  if (Array.isArray(value)) return value as ProviderApiItem[]
  if (value && typeof value === 'object' && 'data' in value) {
    return unwrap((value as { data: unknown }).data)
  }
  return []
}

function mergeRecords(items: ProviderApiItem[]): ProviderRecord[] {
  return PROVIDERS.map((p) => {
    const found = items.find((it) => it.provider === p.key)
    return {
      provider: p.key,
      isConfigured: Boolean(found?.isConfigured),
      lastFour: found?.lastFour ?? null,
      updatedAt: found?.updatedAt ?? null,
    }
  })
}

export interface UseProvidersResult {
  records: ProviderRecord[]
  loading: boolean
  backendMissing: boolean
  error: string | null
  refetch: () => Promise<void>
  saveKey: (provider: ProviderKey, apiKey: string) => Promise<void>
  removeKey: (provider: ProviderKey) => Promise<void>
}

export function useProviders(): UseProvidersResult {
  const [records, setRecords] = useState<ProviderRecord[]>(emptyRecords())
  const [loading, setLoading] = useState(true)
  const [backendMissing, setBackendMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/v1/providers', {
        credentials: 'same-origin',
      })
      if (res.status === 404) {
        setBackendMissing(true)
        setRecords(emptyRecords())
        return
      }
      if (!res.ok) {
        throw new Error(`Erro ${res.status} ao carregar integrações`)
      }
      const json = (await res.json()) as unknown
      const items = unwrap(json)
      setBackendMissing(false)
      setRecords(mergeRecords(items))
    } catch (err) {
      setError((err as Error).message || 'Erro ao carregar integrações')
      setRecords(emptyRecords())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const saveKey = useCallback(
    async (provider: ProviderKey, apiKey: string): Promise<void> => {
      const res = await fetch(`/api/v1/providers/${provider}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({ apiKey }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string
          error?: string
        }
        throw new Error(body.message || body.error || `Erro ${res.status}`)
      }
      await refetch()
    },
    [refetch]
  )

  const removeKey = useCallback(
    async (provider: ProviderKey): Promise<void> => {
      const res = await fetch(`/api/v1/providers/${provider}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: getCsrfHeaders(),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string
          error?: string
        }
        throw new Error(body.message || body.error || `Erro ${res.status}`)
      }
      await refetch()
    },
    [refetch]
  )

  return { records, loading, backendMissing, error, refetch, saveKey, removeKey }
}
