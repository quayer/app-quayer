'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/igniter.client'
import type { Connection } from '@prisma/client'

type Instance = Connection
import type {
  CreateInstanceInput,
  UpdateInstanceInput,
  UpdateCredentialsInput,
  QRCodeResponse,
  InstanceStatusResponse
} from '@/server/communication/instances/instances.interfaces'

// Igniter client methods that take path params (:id) are not typed with those
// params in the generated client — call them via cast to avoid TS errors while
// still sending the correct payload at runtime.
const instancesApi = api.instances as any

export function useInstances(options?: { page?: number; limit?: number; status?: string; search?: string; enablePolling?: boolean }) {
  const { enablePolling = true, ...queryOptions } = options || {}

  return useQuery({
    queryKey: ['instances', queryOptions],
    queryFn: async () => {
      const response = await api.instances.list.query({ query: { limit: 100 } }) as any
      if (response?.error) {
        throw new Error(response.error.message || 'Erro ao carregar integrações')
      }
      return response?.data
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: enablePolling ? 10 * 1000 : false,
    retry: 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}

export function useInstance(id: string) {
  return useQuery({
    queryKey: ['instances', id],
    queryFn: async () => {
      const response = await instancesApi.getById.query({ params: { id } })
      return response.data as Instance
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  })
}

export function useCreateInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateInstanceInput) => {
      const response = await api.instances.create.mutate({ body: data })
      return response.data as Instance
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}

export function useUpdateInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateInstanceInput }) => {
      const response = await instancesApi.update.mutate({ params: { id }, body: data })
      return response.data as Instance
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['instances', id] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}

export function useConnectInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, phone, forceReconnect }: { id: string; phone?: string; forceReconnect?: boolean }) => {
      const body: Record<string, unknown> = {}
      if (phone) body.phone = phone
      if (forceReconnect) body.forceReconnect = true
      const response = await instancesApi.connect.mutate({ params: { id }, body })
      return response.data as QRCodeResponse
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['instances', id] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}

export function useInstanceStatus(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['instances', id, 'status'],
    queryFn: async () => {
      const response = await instancesApi.getStatus.query({ params: { id } })
      return response.data as InstanceStatusResponse
    },
    enabled: enabled && !!id,
    refetchInterval: 3 * 1000,
    staleTime: 0,
  })
}

export function useDisconnectInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await instancesApi.disconnect.mutate({ params: { id } })
      return response.data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['instances', id] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      queryClient.invalidateQueries({ queryKey: ['instances', id, 'status'] })
    },
  })
}

export function useDeleteInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await instancesApi.delete.mutate({ params: { id } })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}

export function useInstanceStats() {
  return useQuery({
    queryKey: ['instances', 'stats'],
    queryFn: async () => {
      const instances = await api.instances.list.query({ query: { limit: 100 } })
      const data = (instances.data?.data || []) as Instance[]

      const stats = {
        total: data.length,
        connected: data.filter(i => (i.status as string) === 'connected').length,
        disconnected: data.filter(i => (i.status as string) === 'disconnected').length,
        connecting: data.filter(i => (i.status as string) === 'connecting').length,
      }

      return stats
    },
    staleTime: 60 * 1000,
  })
}

export function useProfilePicture(instanceId: string) {
  return useQuery({
    queryKey: ['instances', instanceId, 'profile-picture'],
    queryFn: async () => {
      const response = await instancesApi.getProfilePicture.query({ params: { id: instanceId } })
      return response.data as { profilePictureUrl: string }
    },
    enabled: !!instanceId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSetWebhook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ instanceId, webhookUrl, events }: { instanceId: string; webhookUrl: string; events: string[] }) => {
      const response = await instancesApi.setWebhook.mutate({
        params: { id: instanceId },
        body: { webhookUrl, events }
      })
      return response.data
    },
    onSuccess: (_, { instanceId }) => {
      queryClient.invalidateQueries({ queryKey: ['instances', instanceId] })
      queryClient.invalidateQueries({ queryKey: ['instances', instanceId, 'webhook'] })
    },
  })
}

export function useUpdateCredentials() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateCredentialsInput }) => {
      const response = await instancesApi.updateCredentials.mutate({ params: { id }, body: data })
      return response.data as Connection
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['instances', id] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}

export function useShareInstance() {
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await instancesApi.share.mutate({ params: { id } })
      return response.data as { token: string; expiresAt: string; shareUrl: string }
    },
  })
}

export function useWebhook(instanceId: string) {
  return useQuery({
    queryKey: ['instances', instanceId, 'webhook'],
    queryFn: async () => {
      const response = await instancesApi.getWebhook.query({ params: { id: instanceId } })
      return response.data as { webhookUrl: string; events: string[] }
    },
    enabled: !!instanceId,
    staleTime: 30 * 1000,
  })
}
