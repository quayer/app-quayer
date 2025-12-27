'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Tipos de eventos SSE suportados
 */
export type SSEEventType =
  | 'connected'
  | 'heartbeat'
  | 'message.received'
  | 'message.sent'
  | 'session.updated'
  | 'instance.status'
  | 'contact.updated'
  | 'session.labels.changed'
  | 'contact.labels.changed'

export interface SSEEvent<T = any> {
  type: SSEEventType
  data: T
  timestamp: string
}

export interface UseInstanceSSEOptions {
  instanceId?: string
  organizationId?: string
  sessionId?: string
  enabled?: boolean
  onEvent?: (event: SSEEvent) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event) => void
  /** Auto-invalidar queries do React Query ao receber eventos */
  autoInvalidate?: boolean
  /** ID da sessão atualmente selecionada (para invalidações específicas) */
  selectedSessionId?: string
}

/**
 * Debounce simples para invalidações
 */
function createDebouncedInvalidator(delay: number = 500) {
  const pending = new Map<string, NodeJS.Timeout>()

  return {
    invalidate: (key: string, fn: () => void) => {
      const existing = pending.get(key)
      if (existing) clearTimeout(existing)
      pending.set(key, setTimeout(() => {
        fn()
        pending.delete(key)
      }, delay))
    },
    cancel: () => {
      pending.forEach(timeout => clearTimeout(timeout))
      pending.clear()
    }
  }
}

/**
 * Hook para conectar ao SSE de instância, organização ou sessão
 *
 * Usa o endpoint Igniter SSE:
 * - /api/v1/sse/instance/:instanceId
 * - /api/v1/sse/organization/:organizationId
 * - /api/v1/sse/session/:sessionId
 *
 * @example
 * // SSE para uma instância específica
 * const { connected, events, reconnect } = useInstanceSSE({
 *   instanceId: 'inst_123',
 *   onEvent: (event) => console.log('SSE Event:', event),
 * })
 *
 * @example
 * // SSE para toda a organização
 * const { connected, events } = useInstanceSSE({
 *   organizationId: 'org_456',
 *   autoInvalidate: true, // Invalidar React Query automaticamente
 * })
 */
export function useInstanceSSE(options: UseInstanceSSEOptions) {
  const {
    instanceId,
    organizationId,
    sessionId,
    enabled = true,
    onEvent,
    onConnect,
    onDisconnect,
    onError,
    autoInvalidate = false,
    selectedSessionId,
  } = options

  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [error, setError] = useState<Error | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const queryClient = useQueryClient()

  // Debouncer para evitar cascata de invalidações
  const invalidatorRef = useRef(createDebouncedInvalidator(500))

  // Determinar URL do SSE baseado nas opções
  const getSSEUrl = useCallback(() => {
    const baseUrl = process.env.NEXT_PUBLIC_IGNITER_API_URL || 'http://localhost:3000'
    const basePath = process.env.NEXT_PUBLIC_IGNITER_API_BASE_PATH || '/api/v1'

    if (instanceId) {
      return `${baseUrl}${basePath}/sse/instance/${instanceId}`
    }
    if (organizationId) {
      return `${baseUrl}${basePath}/sse/organization/${organizationId}`
    }
    if (sessionId) {
      return `${baseUrl}${basePath}/sse/session/${sessionId}`
    }
    return null
  }, [instanceId, organizationId, sessionId])

  // Handler para eventos SSE com invalidações inteligentes e debounce
  const handleSSEEvent = useCallback(
    (eventType: SSEEventType, data: any) => {
      const event: SSEEvent = {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
      }

      setEvents((prev) => [...prev.slice(-99), event]) // Keep last 100 events
      onEvent?.(event)

      // Auto-invalidar queries relacionadas COM DEBOUNCE
      if (autoInvalidate) {
        const invalidator = invalidatorRef.current
        const eventSessionId = data?.sessionId || data?.session?.id

        switch (eventType) {
          case 'instance.status':
            // Debounce por instância
            invalidator.invalidate(`instance-${instanceId}`, () => {
              queryClient.invalidateQueries({ queryKey: ['all-instances'] })
              queryClient.invalidateQueries({ queryKey: ['instance', instanceId] })
              queryClient.invalidateQueries({ queryKey: ['conversations', 'instances'] })
            })
            break

          case 'message.received':
          case 'message.sent':
            // OTIMIZAÇÃO: Invalidar apenas a sessão específica se disponível
            if (eventSessionId) {
              // Se a mensagem é da sessão selecionada, invalidar mensagens
              if (eventSessionId === selectedSessionId) {
                invalidator.invalidate(`messages-${eventSessionId}`, () => {
                  queryClient.invalidateQueries({
                    queryKey: ['conversations', 'messages', eventSessionId],
                  })
                })
              }
              // Atualizar lista de chats de forma otimista (mover para o topo)
              invalidator.invalidate('chats-list', () => {
                queryClient.invalidateQueries({
                  queryKey: ['conversations', 'chats'],
                  // Não forçar refetch imediato, deixar staleTime funcionar
                  refetchType: 'active',
                })
              })
            } else {
              // Fallback: invalidar tudo se não temos sessionId
              invalidator.invalidate('messages-all', () => {
                queryClient.invalidateQueries({ queryKey: ['messages'] })
                queryClient.invalidateQueries({ queryKey: ['conversations', 'messages'] })
              })
              invalidator.invalidate('chats-list', () => {
                queryClient.invalidateQueries({
                  queryKey: ['conversations', 'chats'],
                  refetchType: 'active',
                })
              })
            }
            break

          case 'session.updated':
          case 'session.labels.changed':
            // Debounce por tipo de evento
            invalidator.invalidate('session-update', () => {
              if (eventSessionId) {
                queryClient.invalidateQueries({ queryKey: ['sessions', eventSessionId] })
              }
              queryClient.invalidateQueries({
                queryKey: ['conversations', 'chats'],
                refetchType: 'active',
              })
            })
            break

          case 'contact.updated':
          case 'contact.labels.changed':
            invalidator.invalidate('contacts', () => {
              queryClient.invalidateQueries({ queryKey: ['contacts'] })
            })
            break
        }
      }
    },
    [autoInvalidate, instanceId, selectedSessionId, onEvent, queryClient]
  )

  // State para forçar reconexão
  const [reconnectKey, setReconnectKey] = useState(0)

  // Desconectar do SSE
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
      setConnected(false)
    }
  }, [])

  // Reconectar - incrementa o key para forçar o useEffect a recriar a conexão
  const reconnect = useCallback(() => {
    disconnect()
    setTimeout(() => setReconnectKey(k => k + 1), 1000)
  }, [disconnect])

  // Função connect mantida para API externa (deprecated, use reconnect instead)
  const connect = useCallback(() => {
    setReconnectKey(k => k + 1)
  }, [])

  // Limpar eventos
  const clearEvents = useCallback(() => {
    setEvents([])
  }, [])

  // Effect para conectar/desconectar automaticamente
  // Note: Using refs to avoid dependency issues with connect/disconnect
  useEffect(() => {
    const url = getSSEUrl()
    if (!url || !enabled) return

    // Fechar conexão existente
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    try {
      const eventSource = new EventSource(url, { withCredentials: true })
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setConnected(true)
        setError(null)
        onConnect?.()
      }

      eventSource.onerror = (e) => {
        setConnected(false)
        setError(new Error('SSE connection error'))
        onError?.(e)
        onDisconnect?.()
      }

      // Listeners para eventos específicos
      const eventTypes: SSEEventType[] = [
        'connected',
        'heartbeat',
        'message.received',
        'message.sent',
        'session.updated',
        'instance.status',
        'contact.updated',
        'session.labels.changed',
        'contact.labels.changed',
      ]

      eventTypes.forEach((eventType) => {
        eventSource.addEventListener(eventType, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data)
            handleSSEEvent(eventType, data)
          } catch (err) {
            console.error(`[SSE] Error parsing ${eventType} event:`, err)
          }
        })
      })

      // Listener genérico para eventos não mapeados
      eventSource.onmessage = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          handleSSEEvent('connected' as SSEEventType, data)
        } catch (err) {
          console.error('[SSE] Error parsing message:', err)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to connect SSE'))
    }

    // Cleanup: fechar conexão e cancelar debounces pendentes ao desmontar
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
        setConnected(false)
      }
      invalidatorRef.current.cancel()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, organizationId, sessionId, enabled, reconnectKey])

  return {
    connected,
    events,
    error,
    connect,
    disconnect,
    reconnect,
    clearEvents,
    lastEvent: events[events.length - 1] || null,
  }
}

/**
 * Hook simplificado para status de instância via SSE
 */
export function useInstanceStatusSSE(instanceId: string | undefined) {
  const [status, setStatus] = useState<string>('unknown')

  const { connected, error } = useInstanceSSE({
    instanceId,
    enabled: !!instanceId,
    onEvent: (event) => {
      if (event.type === 'instance.status' && event.data?.status) {
        setStatus(event.data.status)
      }
    },
  })

  return { status, connected, error }
}
