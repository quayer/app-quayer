'use client'

import { useQuery } from '@tanstack/react-query'
import { listAllInstancesFromProvidersAction } from '@/app/admin/actions'

/**
 * Hook para buscar todas as instancias do UAZapi e banco local (admin only)
 */
export function useAllInstances() {
  return useQuery({
    queryKey: ['all-instances'],
    queryFn: async () => {
      const result = await listAllInstancesFromProvidersAction()
      if (!result.success) {
        throw new Error(result.error || 'Erro ao buscar instancias')
      }
      return result
    },
    staleTime: 30000, // 30 segundos
    refetchOnWindowFocus: false,
  })
}
