'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/igniter.client'
import type { Instance } from '@prisma/client'
import type {
  CreateInstanceInput,
  UpdateInstanceInput,
  QRCodeResponse,
  InstanceStatusResponse
} from '@/features/instances/instances.interfaces'

/**
 * @hook useInstances
 * @description Hook para listar todas as instâncias WhatsApp com polling inteligente
 * @returns {object} Objeto com dados, loading, error e refetch
 */
export function useInstances(options?: { page?: number; limit?: number; status?: string; search?: string; enablePolling?: boolean }) {
  const { enablePolling = true, ...queryOptions } = options || {}

  return useQuery({
    queryKey: ['instances', queryOptions],
    queryFn: async () => {
      const response = await api.instances.list.query()

      // Tratamento de erro explícito
      if (response.error) {
        console.error('Error loading instances:', response.error)
        throw new Error(response.error.message || 'Erro ao carregar integrações')
      }

      // Retornar a resposta completa (Igniter.js já retorna { data, error })
      return response.data
    },
    staleTime: 0, // Sempre buscar dados frescos para real-time sync
    refetchOnWindowFocus: true,
    refetchInterval: enablePolling ? 10 * 1000 : false, // Polling a cada 10 segundos (conforme especificação)
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
      const response = await api.instances.getById.query()
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
      return response.data as Instance
    },
    onSuccess: () => {
      // Business Logic: Invalidar cache de instâncias após criação
      queryClient.invalidateQueries({ queryKey: ['instances'] })
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
      const response = await api.instances.update.mutate({
        body: data
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
      const response = await api.instances.connect.mutate()
      return response.data as QRCodeResponse
    },
    onSuccess: (_, id) => {
      // Business Logic: Invalidar cache da instância após conectar
      queryClient.invalidateQueries({ queryKey: ['instances', id] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
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
      const response = await api.instances.getStatus.query()
      return response.data as InstanceStatusResponse
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
      const response = await api.instances.disconnect.mutate()
      return response.data
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
      const response = await api.instances.delete.mutate()
      return response.data
    },
    onSuccess: () => {
      // Business Logic: Invalidar cache de instâncias após deletar
      queryClient.invalidateQueries({ queryKey: ['instances'] })
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
        connected: data.filter(i => i.status === 'connected').length,
        disconnected: data.filter(i => i.status === 'disconnected').length,
        connecting: data.filter(i => i.status === 'connecting').length,
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
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ['instances', instanceId, 'profile-picture'],
    queryFn: async () => {
      const response = await api.instances.getProfilePicture.query()
      return response.data as { profilePictureUrl: string }
    },
    enabled: !!instanceId,
    staleTime: 5 * 60 * 1000, // 5 minutos (fotos de perfil não mudam com frequência)
    onSuccess: () => {
      // Invalidar cache da instância para atualizar dados
      queryClient.invalidateQueries({ queryKey: ['instances', instanceId] })
    },
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
      const response = await api.instances.setWebhook.mutate({
        body: { webhookUrl, events }
      })
      return response.data
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
      const response = await api.instances.getWebhook.query()
      return response.data as { webhookUrl: string; events: string[] }
    },
    enabled: !!instanceId,
    staleTime: 30 * 1000, // 30 segundos
  })
}
