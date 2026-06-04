'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCsrfHeaders } from '@/client/hooks/use-csrf-token'
import {
  PROVIDERS,
  emptyGroups,
  groupToRecord,
  type ProviderGroup,
  type ProviderKey,
  type ProviderKeyRecord,
  type ProviderRecord,
} from './providers-catalog'

/**
 * Forma de cada item retornado por GET /api/v1/providers/:provider/keys.
 * Datas viajam como ISO strings.
 */
interface ProviderKeyApiItem {
  id: string
  name: string
  provider: ProviderKey
  lastFour: string | null
  isPrimary: boolean
  priority: number
  updatedAt: string | null
}

function unwrap(value: unknown): ProviderKeyApiItem[] {
  if (Array.isArray(value)) return value as ProviderKeyApiItem[]
  if (value && typeof value === 'object' && 'data' in value) {
    return unwrap((value as { data: unknown }).data)
  }
  return []
}

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as {
    message?: string
    error?: string
  }
  return body.message || body.error || `Erro ${res.status}`
}

export interface UseProvidersResult {
  groups: ProviderGroup[]
  loading: boolean
  backendMissing: boolean
  error: string | null
  refetch: () => Promise<void>
  createKey: (provider: ProviderKey, apiKey: string, name: string) => Promise<void>
  removeKey: (id: string) => Promise<void>
  /**
   * @deprecated Surface single-key legada (derivada de `groups`) p/ consumidores
   * fora desta refatoração. Cada provider vira 1 ProviderRecord (chave primária).
   */
  records: ProviderRecord[]
  /**
   * @deprecated Cria uma chave com rótulo automático. Usar `createKey` (com nome).
   */
  saveKey: (provider: ProviderKey, apiKey: string) => Promise<void>
}

export function useProviders(): UseProvidersResult {
  const [groups, setGroups] = useState<ProviderGroup[]>(emptyGroups())
  const [loading, setLoading] = useState(true)
  const [backendMissing, setBackendMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      setError(null)
      const results = await Promise.all(
        PROVIDERS.map(async (p) => {
          const res = await fetch(`/api/v1/providers/${p.key}/keys`, {
            credentials: 'same-origin',
          })
          if (res.status === 404) return { provider: p.key, missing: true, keys: [] }
          if (!res.ok) throw new Error(await readError(res))
          const json = (await res.json()) as unknown
          return {
            provider: p.key,
            missing: false,
            keys: unwrap(json) as ProviderKeyRecord[],
          }
        }),
      )

      const allMissing = results.every((r) => r.missing)
      setBackendMissing(allMissing)
      setGroups(
        PROVIDERS.map((p) => {
          const found = results.find((r) => r.provider === p.key)
          return { provider: p.key, keys: found?.keys ?? [] }
        }),
      )
    } catch (err) {
      setError((err as Error).message || 'Erro ao carregar integrações')
      setGroups(emptyGroups())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const createKey = useCallback(
    async (provider: ProviderKey, apiKey: string, name: string): Promise<void> => {
      const res = await fetch(`/api/v1/providers/${provider}/keys`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({ apiKey, name }),
      })
      if (!res.ok) throw new Error(await readError(res))
      await refetch()
    },
    [refetch],
  )

  const removeKey = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch(`/api/v1/providers/keys/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: getCsrfHeaders(),
      })
      if (!res.ok) throw new Error(await readError(res))
      await refetch()
    },
    [refetch],
  )

  // ── Surface legada (single-key) derivada de groups ──────────────────────────
  const records = groups.map(groupToRecord)
  const saveKey = useCallback(
    (provider: ProviderKey, apiKey: string): Promise<void> =>
      createKey(provider, apiKey, 'Chave principal'),
    [createKey],
  )

  return {
    groups,
    loading,
    backendMissing,
    error,
    refetch,
    createKey,
    removeKey,
    records,
    saveKey,
  }
}
