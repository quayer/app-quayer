'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/igniter.client'
import type { Connection as Instance } from '@prisma/client'
import type {
  CreateInstanceInput,
  UpdateInstanceInput,
  QRCodeResponse,
  InstanceStatusResponse
} from '@/features/instances/instances.interfaces'

// Helper para fazer requests autenticados
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    let errorMessage = `Erro HTTP ${response.status}`
    try {
      const errorData = await response.json()
      // Extrair mensagem de erro de forma robusta
      if (typeof errorData === 'string') {
        errorMessage = errorData
      } else if (errorData?.message) {
        errorMessage = errorData.message
      } else if (errorData?.error) {
        errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.error?.message || JSON.stringify(errorData.error)
      }
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(errorMessage)
  }

  // Verificar se há conteúdo para parsear
  const text = await response.text()
  if (!text) {
    return { success: true }
  }

  try {
    return JSON.parse(text)
  } catch {
    return { success: true, data: text }
  }
}

/**
 * @hook useInstances
 * @description Hook para listar todas as instâncias WhatsApp com polling inteligente
 * @returns {object} Objeto com dados, loading, error e refetch
 */
export function useInstances(options?: { page?: number; limit?: number; status?: string; search?: string; enablePolling?: boolean; fastPolling?: boolean }) {
  const { enablePolling = true, fastPolling = false, ...queryOptions } = options || {}

  return useQuery({
    queryKey: ['instances', queryOptions],
    queryFn: async () => {
      const response = await api.instances.list.query({ query: {} })

      // Tratamento de erro explícito
      if (response.error) {
        console.error('Error loading instances:', response.error)
        const errorMessage = (response.error as { message?: string })?.message || 'Erro ao carregar integrações'
        throw new Error(errorMessage)
      }

      // Retornar a resposta completa (Igniter.js já retorna { data, error })
      return response.data
    },
    staleTime: 0, // Sempre buscar dados frescos para real-time sync
    refetchOnWindowFocus: true,
    // Polling: 3 segundos se fastPolling, 10 segundos normal, false se desabilitado
    refetchInterval: enablePolling ? (fastPolling ? 3 * 1000 : 10 * 1000) : false,
    retry: 2, // Tentar novamente 2 vezes antes de falhar
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  })
}

/**
 * @hook useInstance
 * @description Hook para buscar uma instância específica por ID
 * @param {string} id - ID da instância
 * @returns {object} Objeto com dados da instância, loading e error
 */
export function useInstance(id: string) {
  return useQuery({
    queryKey: ['instances', id],
    queryFn: async () => {
      const response = await fetchWithAuth(`/api/v1/instances/${id}`)
      return response.data as Instance
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  })
}

/**
 * @hook useCreateInstance
 * @description Hook para criar uma nova instância
 * @returns {object} Objeto com mutation para criar instância
 */
export function useCreateInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateInstanceInput) => {
      const response = await api.instances.create.mutate({
        body: data
      })

      // Verificar se houve erro na resposta do Igniter.js
      if (response.error) {
        // Extrair mensagem de erro
        const errorMessage = typeof response.error === 'string'
          ? response.error
          : (response.error as { message?: string })?.message || 'Erro ao criar instância na UAZapi'
        throw new Error(errorMessage)
      }

      if (!response.data) {
        throw new Error('Resposta vazia da API ao criar instância')
      }

      return response.data as Instance
    },
    onSuccess: () => {
      // Business Logic: Invalidar cache de instâncias após criação
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      queryClient.invalidateQueries({ queryKey: ['all-instances'] })
    },
  })
}

/**
 * @hook useUpdateInstance
 * @description Hook para atualizar uma instância existente
 * @returns {object} Objeto com mutation para atualizar instância
 */
export function useUpdateInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateInstanceInput }) => {
      const response = await fetchWithAuth(`/api/v1/instances/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      return response.data as Instance
    },
    onSuccess: (_, { id }) => {
      // Business Logic: Invalidar cache da instância específica e lista geral
      queryClient.invalidateQueries({ queryKey: ['instances', id] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}

/**
 * @hook useConnectInstance
 * @description Hook para conectar uma instância e obter QR Code
 * @returns {object} Objeto com mutation para conectar instância
 */
export function useConnectInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchWithAuth(`/api/v1/instances/${id}/connect`, {
        method: 'POST',
      })
      // Igniter retorna { data: { qrcode, expires }, error: null }
      const data = response.data || response
      return data as QRCodeResponse
    },
    onSuccess: (_, id) => {
      // Business Logic: Invalidar cache da instância após conectar
      queryClient.invalidateQueries({ queryKey: ['instances', id] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      queryClient.invalidateQueries({ queryKey: ['all-instances'] })
      queryClient.invalidateQueries({ queryKey: ['instances', 'stats'] })
    },
    onError: (error) => {
      console.error('[useConnectInstance] Erro ao conectar:', error)
    },
  })
}

/**
 * @hook useInstanceStatus
 * @description Hook para verificar status de uma instância com polling de 3 segundos
 * @param {string} id - ID da instância
 * @param {boolean} enabled - Se o polling deve estar ativo
 * @returns {object} Objeto com dados do status, loading e error
 */
export function useInstanceStatus(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['instances', id, 'status'],
    queryFn: async () => {
      const response = await fetchWithAuth(`/api/v1/instances/${id}/status`)
      // ✅ CORREÇÃO: Igniter retorna { data: { status, ... }, error: null }
      const data = response.data || response
      return data as InstanceStatusResponse
    },
    enabled: enabled && !!id,
    refetchInterval: 3 * 1000, // Polling a cada 3 segundos (conforme especificação)
    staleTime: 0, // Sempre buscar dados frescos
  })
}

/**
 * @hook useDisconnectInstance
 * @description Hook para desconectar uma instância
 * @returns {object} Objeto com mutation para desconectar instância
 */
export function useDisconnectInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchWithAuth(`/api/v1/instances/${id}/disconnect`, {
        method: 'POST',
      })
      return response
    },
    onSuccess: (_, id) => {
      // Business Logic: Invalidar cache após desconectar
      queryClient.invalidateQueries({ queryKey: ['instances', id] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      queryClient.invalidateQueries({ queryKey: ['instances', id, 'status'] })
    },
  })
}

/**
 * @hook useDeleteInstance
 * @description Hook para deletar uma instância
 * @returns {object} Objeto com mutation para deletar instância
 */
export function useDeleteInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchWithAuth(`/api/v1/instances/${id}`, {
        method: 'DELETE',
      })
      return response
    },
    onMutate: async (id: string) => {
      // Cancelar TODAS as queries de instances para evitar race conditions
      await queryClient.cancelQueries({ queryKey: ['instances'] })

      // Snapshot de TODAS as queries de instances
      const previousData = queryClient.getQueriesData({ queryKey: ['instances'] })

      // Função helper para filtrar instâncias de qualquer formato
      const filterInstance = (data: any, instanceId: string): any => {
        if (!data) return data

        // Formato: { data: [...] } (array direto em data)
        if (data.data && Array.isArray(data.data)) {
          return {
            ...data,
            data: data.data.filter((instance: any) => instance.id !== instanceId)
          }
        }

        // Formato: Array direto
        if (Array.isArray(data)) {
          return data.filter((instance: any) => instance.id !== instanceId)
        }

        // Formato: { data: { data: [...] } } (nested data com pagination)
        if (data.data?.data && Array.isArray(data.data.data)) {
          return {
            ...data,
            data: {
              ...data.data,
              data: data.data.data.filter((instance: any) => instance.id !== instanceId)
            }
          }
        }

        return data
      }

      // Aplicar optimistic update em TODAS as queries de instances
      queryClient.setQueriesData({ queryKey: ['instances'] }, (old: any) => filterInstance(old, id))

      return { previousData }
    },
    onError: (_error, _id, context) => {
      // Reverter TODAS as queries para dados anteriores em caso de erro
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]: [any, any]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
    },
    onSuccess: () => {
      // Invalidar após sucesso com delay para dar tempo do servidor processar
      // Isso evita que o polling traga de volta dados desatualizados
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['instances'] })
        queryClient.invalidateQueries({ queryKey: ['all-instances'] })
        queryClient.invalidateQueries({ queryKey: ['instances', 'stats'] })
      }, 500)
    },
  })
}

/**
 * @hook useInstanceStats
 * @description Hook para obter estatísticas das instâncias
 * @returns {object} Objeto com estatísticas das instâncias
 */
export function useInstanceStats() {
  return useQuery({
    queryKey: ['instances', 'stats'],
    queryFn: async () => {
      const instances = await api.instances.list.query({ query: {} })
      const data = (instances.data?.data || []) as Instance[]

      // Business Logic: Calcular estatísticas das instâncias
      const stats = {
        total: data.length,
        connected: data.filter(i => i.status === 'CONNECTED').length,
        disconnected: data.filter(i => i.status === 'DISCONNECTED').length,
        connecting: data.filter(i => i.status === 'CONNECTING').length,
      }

      return stats
    },
    staleTime: 60 * 1000, // 1 minuto
  })
}

/**
 * @hook useProfilePicture
 * @description Hook para obter foto de perfil do WhatsApp conectado
 * @param {string} instanceId - ID da instância
 * @returns {object} Objeto com URL da foto de perfil, loading e error
 */
export function useProfilePicture(instanceId: string) {
  return useQuery({
    queryKey: ['instances', instanceId, 'profile-picture'],
    queryFn: async () => {
      const response = await fetchWithAuth(`/api/v1/instances/${instanceId}/profile-picture`)
      // ✅ CORREÇÃO: Igniter retorna { data: { profilePictureUrl }, error: null }
      const data = response.data || response
      return data as { profilePictureUrl: string }
    },
    enabled: !!instanceId,
    staleTime: 5 * 60 * 1000, // 5 minutos (fotos de perfil não mudam com frequência)
  })
}

/**
 * @hook useSetWebhook
 * @description Hook para configurar webhook da instância (Admin apenas)
 * @returns {object} Objeto com mutation para configurar webhook
 */
export function useSetWebhook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ instanceId, webhookUrl, events }: { instanceId: string; webhookUrl: string; events: string[] }) => {
      const response = await fetchWithAuth(`/api/v1/instances/${instanceId}/webhook`, {
        method: 'POST',
        body: JSON.stringify({ webhookUrl, events }),
      })
      return response
    },
    onSuccess: (_, { instanceId }) => {
      // Invalidar cache da instância e webhook após configuração
      queryClient.invalidateQueries({ queryKey: ['instances', instanceId] })
      queryClient.invalidateQueries({ queryKey: ['instances', instanceId, 'webhook'] })
    },
  })
}

/**
 * @hook useWebhook
 * @description Hook para obter configuração do webhook (Admin apenas)
 * @param {string} instanceId - ID da instância
 * @returns {object} Objeto com configuração do webhook, loading e error
 */
export function useWebhook(instanceId: string) {
  return useQuery({
    queryKey: ['instances', instanceId, 'webhook'],
    queryFn: async () => {
      const response = await fetchWithAuth(`/api/v1/instances/${instanceId}/webhook`)
      // ✅ CORREÇÃO: Igniter retorna { data: { webhookUrl, events }, error: null }
      const data = response.data || response
      return data as { webhookUrl: string; events: string[] }
    },
    enabled: !!instanceId,
    staleTime: 30 * 1000, // 30 segundos
  })
}
