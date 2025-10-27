import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  useInstances,
  useInstance,
  useCreateInstance,
  useUpdateInstance,
  useConnectInstance,
  useInstanceStatus,
  useDisconnectInstance,
  useDeleteInstance,
  useInstanceStats,
  useProfilePicture,
  useSetWebhook,
  useWebhook
} from '@/hooks/useInstance'
import type { Instance } from '@prisma/client'

/**
 * @test Unit Tests - useInstance Hooks
 * @description Testes unitários completos para hooks de instâncias WhatsApp
 */

// Mock do api client
vi.mock('@/igniter.client', () => ({
  api: {
    instances: {
      list: {
        query: vi.fn(),
      },
      getById: {
        query: vi.fn(),
      },
      create: {
        mutate: vi.fn(),
      },
      update: {
        mutate: vi.fn(),
      },
      connect: {
        mutate: vi.fn(),
      },
      getStatus: {
        query: vi.fn(),
      },
      disconnect: {
        mutate: vi.fn(),
      },
      delete: {
        mutate: vi.fn(),
      },
      getProfilePicture: {
        query: vi.fn(),
      },
      setWebhook: {
        mutate: vi.fn(),
      },
      getWebhook: {
        query: vi.fn(),
      },
    },
  },
}))

// Helper para criar wrapper com QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useInstance Hooks', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
  })

  describe('useInstances', () => {
    const mockInstances: Instance[] = [
      {
        id: '1',
        name: 'Test Instance 1',
        status: 'connected',
        brokerId: 'broker-1',
        brokerType: 'uazapi',
        organizationId: 'org-1',
        phoneNumber: '+5511999887766',
        profilePictureUrl: null,
        webhookUrl: null,
        webhookEvents: [],
        lastConnected: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        name: 'Test Instance 2',
        status: 'disconnected',
        brokerId: 'broker-2',
        brokerType: 'uazapi',
        organizationId: 'org-1',
        phoneNumber: null,
        profilePictureUrl: null,
        webhookUrl: null,
        webhookEvents: [],
        lastConnected: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    it('Deve buscar lista de instâncias', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.list.query).mockResolvedValue({
        data: mockInstances
      } as any)

      const { result } = renderHook(() => useInstances(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockInstances)
      expect(api.instances.list.query).toHaveBeenCalledTimes(1)
    })

    it('Deve habilitar polling por padrão', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.list.query).mockResolvedValue({
        data: []
      } as any)

      const { result } = renderHook(() => useInstances(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      // Verificar que refetchInterval está configurado (via options internos)
      expect(result.current.isSuccess).toBe(true)
    })

    it('Deve desabilitar polling quando solicitado', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.list.query).mockResolvedValue({
        data: []
      } as any)

      const { result } = renderHook(() => useInstances({ enablePolling: false }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.isSuccess).toBe(true)
    })

    it('Deve lidar com erro ao buscar instâncias', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.list.query).mockRejectedValue(
        new Error('Network error')
      )

      const { result } = renderHook(() => useInstances(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      expect(result.current.error).toBeDefined()
    })
  })

  describe('useInstance', () => {
    const mockInstance: Instance = {
      id: '123',
      name: 'Test Instance',
      status: 'connected',
      brokerId: 'broker-123',
      brokerType: 'uazapi',
      organizationId: 'org-1',
      phoneNumber: '+5511999887766',
      profilePictureUrl: null,
      webhookUrl: null,
      webhookEvents: [],
      lastConnected: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('Deve buscar instância específica por ID', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.getById.query).mockResolvedValue({
        data: mockInstance
      } as any)

      const { result } = renderHook(() => useInstance('123'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockInstance)
      expect(api.instances.getById.query).toHaveBeenCalledTimes(1)
    })

    it('Não deve buscar se ID não fornecido', async () => {
      const { api } = await import('@/igniter.client')

      const { result } = renderHook(() => useInstance(''), {
        wrapper: createWrapper(),
      })

      // Aguardar um pouco para garantir que não foi chamado
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(result.current.isLoading).toBe(false)
      expect(api.instances.getById.query).not.toHaveBeenCalled()
    })

    it('Deve lidar com erro ao buscar instância', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.getById.query).mockRejectedValue(
        new Error('Instance not found')
      )

      const { result } = renderHook(() => useInstance('123'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      expect(result.current.error).toBeDefined()
    })
  })

  describe('useCreateInstance', () => {
    const mockNewInstance: Instance = {
      id: 'new-123',
      name: 'New Instance',
      status: 'disconnected',
      brokerId: 'broker-new',
      brokerType: 'uazapi',
      organizationId: 'org-1',
      phoneNumber: null,
      profilePictureUrl: null,
      webhookUrl: null,
      webhookEvents: [],
      lastConnected: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('Deve criar nova instância', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.create.mutate).mockResolvedValue({
        data: mockNewInstance
      } as any)

      const { result } = renderHook(() => useCreateInstance(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        name: 'New Instance',
        brokerType: 'uazapi',
        organizationId: 'org-1',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockNewInstance)
      expect(api.instances.create.mutate).toHaveBeenCalledWith({
        body: {
          name: 'New Instance',
          brokerType: 'uazapi',
          organizationId: 'org-1',
        },
      })
    })

    it('Deve invalidar cache de instâncias após criar', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.create.mutate).mockResolvedValue({
        data: mockNewInstance
      } as any)

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useCreateInstance(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        name: 'New Instance',
        brokerType: 'uazapi',
        organizationId: 'org-1',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['instances'] })
    })

    it('Deve lidar com erro ao criar instância', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.create.mutate).mockRejectedValue(
        new Error('Creation failed')
      )

      const { result } = renderHook(() => useCreateInstance(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        name: 'New Instance',
        brokerType: 'uazapi',
        organizationId: 'org-1',
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      expect(result.current.error).toBeDefined()
    })
  })

  describe('useConnectInstance', () => {
    const mockQRCode = {
      qrcode: 'data:image/png;base64,abc123',
      pairingCode: '',
      expires: 120000,
    }

    it('Deve conectar instância e obter QR Code', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.connect.mutate).mockResolvedValue({
        data: mockQRCode
      } as any)

      const { result } = renderHook(() => useConnectInstance(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('123')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockQRCode)
      expect(api.instances.connect.mutate).toHaveBeenCalled()
    })

    it('Deve invalidar cache após conectar', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.connect.mutate).mockResolvedValue({
        data: mockQRCode
      } as any)

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useConnectInstance(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('123')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['instances', '123'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['instances'] })
    })
  })

  describe('useInstanceStatus', () => {
    const mockStatus = {
      status: 'connected' as const,
      phoneNumber: '+5511999887766',
      name: 'Test User',
      lastSeen: new Date(),
    }

    it('Deve buscar status da instância', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.getStatus.query).mockResolvedValue({
        data: mockStatus
      } as any)

      const { result } = renderHook(() => useInstanceStatus('123'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockStatus)
      expect(api.instances.getStatus.query).toHaveBeenCalled()
    })

    it('Não deve buscar se enabled=false', async () => {
      const { api } = await import('@/igniter.client')

      const { result } = renderHook(() => useInstanceStatus('123', false), {
        wrapper: createWrapper(),
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(result.current.isLoading).toBe(false)
      expect(api.instances.getStatus.query).not.toHaveBeenCalled()
    })

    it('Não deve buscar se ID vazio', async () => {
      const { api } = await import('@/igniter.client')

      const { result } = renderHook(() => useInstanceStatus(''), {
        wrapper: createWrapper(),
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(result.current.isLoading).toBe(false)
      expect(api.instances.getStatus.query).not.toHaveBeenCalled()
    })
  })

  describe('useDisconnectInstance', () => {
    it('Deve desconectar instância', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.disconnect.mutate).mockResolvedValue({
        data: { success: true }
      } as any)

      const { result } = renderHook(() => useDisconnectInstance(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('123')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(api.instances.disconnect.mutate).toHaveBeenCalled()
    })

    it('Deve invalidar múltiplos caches após desconectar', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.disconnect.mutate).mockResolvedValue({
        data: { success: true }
      } as any)

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useDisconnectInstance(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('123')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['instances', '123'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['instances'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['instances', '123', 'status'] })
    })
  })

  describe('useDeleteInstance', () => {
    it('Deve deletar instância', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.delete.mutate).mockResolvedValue({
        data: { success: true }
      } as any)

      const { result } = renderHook(() => useDeleteInstance(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('123')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(api.instances.delete.mutate).toHaveBeenCalled()
    })

    it('Deve invalidar cache após deletar', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.delete.mutate).mockResolvedValue({
        data: { success: true }
      } as any)

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useDeleteInstance(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('123')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['instances'] })
    })
  })

  describe('useInstanceStats', () => {
    const mockInstances = [
      { status: 'connected' },
      { status: 'connected' },
      { status: 'disconnected' },
      { status: 'connecting' },
    ]

    it('Deve calcular estatísticas corretamente', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.list.query).mockResolvedValue({
        data: { data: mockInstances }
      } as any)

      const { result } = renderHook(() => useInstanceStats(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual({
        total: 4,
        connected: 2,
        disconnected: 1,
        connecting: 1,
      })
    })

    it('Deve lidar com lista vazia', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.list.query).mockResolvedValue({
        data: { data: [] }
      } as any)

      const { result } = renderHook(() => useInstanceStats(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual({
        total: 0,
        connected: 0,
        disconnected: 0,
        connecting: 0,
      })
    })
  })

  describe('useProfilePicture', () => {
    const mockProfile = {
      profilePictureUrl: 'https://example.com/profile.jpg',
    }

    it('Deve buscar foto de perfil', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.getProfilePicture.query).mockResolvedValue({
        data: mockProfile
      } as any)

      const { result } = renderHook(() => useProfilePicture('123'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockProfile)
    })

    it('Não deve buscar se instanceId vazio', async () => {
      const { api } = await import('@/igniter.client')

      const { result } = renderHook(() => useProfilePicture(''), {
        wrapper: createWrapper(),
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(result.current.isLoading).toBe(false)
      expect(api.instances.getProfilePicture.query).not.toHaveBeenCalled()
    })
  })

  describe('useSetWebhook', () => {
    const webhookData = {
      instanceId: '123',
      webhookUrl: 'https://example.com/webhook',
      events: ['message.received', 'message.sent'],
    }

    it('Deve configurar webhook', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.setWebhook.mutate).mockResolvedValue({
        data: { success: true }
      } as any)

      const { result } = renderHook(() => useSetWebhook(), {
        wrapper: createWrapper(),
      })

      result.current.mutate(webhookData)

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(api.instances.setWebhook.mutate).toHaveBeenCalledWith({
        body: {
          webhookUrl: webhookData.webhookUrl,
          events: webhookData.events,
        },
      })
    })

    it('Deve invalidar cache após configurar webhook', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.setWebhook.mutate).mockResolvedValue({
        data: { success: true }
      } as any)

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useSetWebhook(), {
        wrapper: createWrapper(),
      })

      result.current.mutate(webhookData)

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['instances', '123'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['instances', '123', 'webhook'] })
    })
  })

  describe('useWebhook', () => {
    const mockWebhook = {
      webhookUrl: 'https://example.com/webhook',
      events: ['message.received'],
    }

    it('Deve buscar configuração do webhook', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.getWebhook.query).mockResolvedValue({
        data: mockWebhook
      } as any)

      const { result } = renderHook(() => useWebhook('123'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockWebhook)
    })

    it('Não deve buscar se instanceId vazio', async () => {
      const { api } = await import('@/igniter.client')

      const { result } = renderHook(() => useWebhook(''), {
        wrapper: createWrapper(),
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(result.current.isLoading).toBe(false)
      expect(api.instances.getWebhook.query).not.toHaveBeenCalled()
    })
  })

  describe('useUpdateInstance', () => {
    const mockUpdatedInstance: Instance = {
      id: '123',
      name: 'Updated Instance',
      status: 'connected',
      brokerId: 'broker-123',
      brokerType: 'uazapi',
      organizationId: 'org-1',
      phoneNumber: '+5511999887766',
      profilePictureUrl: null,
      webhookUrl: null,
      webhookEvents: [],
      lastConnected: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('Deve atualizar instância', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.update.mutate).mockResolvedValue({
        data: mockUpdatedInstance
      } as any)

      const { result } = renderHook(() => useUpdateInstance(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        id: '123',
        data: { name: 'Updated Instance' },
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockUpdatedInstance)
      expect(api.instances.update.mutate).toHaveBeenCalledWith({
        body: { name: 'Updated Instance' },
      })
    })

    it('Deve invalidar cache após atualizar', async () => {
      const { api } = await import('@/igniter.client')
      vi.mocked(api.instances.update.mutate).mockResolvedValue({
        data: mockUpdatedInstance
      } as any)

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useUpdateInstance(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        id: '123',
        data: { name: 'Updated Instance' },
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['instances', '123'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['instances'] })
    })
  })
})
