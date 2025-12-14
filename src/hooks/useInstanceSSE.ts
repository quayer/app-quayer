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
  } = options

  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [error, setError] = useState<Error | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const queryClient = useQueryClient()

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

  // Handler para eventos SSE
  const handleSSEEvent = useCallback(
    (eventType: SSEEventType, data: any) => {
      const event: SSEEvent = {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
      }

      setEvents((prev) => [...prev.slice(-99), event]) // Keep last 100 events
      onEvent?.(event)

      // Auto-invalidar queries relacionadas
      if (autoInvalidate) {
        switch (eventType) {
          case 'instance.status':
            queryClient.invalidateQueries({ queryKey: ['all-instances'] })
            queryClient.invalidateQueries({ queryKey: ['instance', instanceId] })
            break
          case 'message.received':
          case 'message.sent':
            queryClient.invalidateQueries({ queryKey: ['messages'] })
            queryClient.invalidateQueries({ queryKey: ['sessions'] })
            break
          case 'session.updated':
          case 'session.labels.changed':
            queryClient.invalidateQueries({ queryKey: ['sessions'] })
            break
          case 'contact.updated':
          case 'contact.labels.changed':
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
            break
        }
      }
    },
    [autoInvalidate, instanceId, onEvent, queryClient]
  )

  // Conectar ao SSE
  const connect = useCallback(() => {
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
  }, [getSSEUrl, enabled, onConnect, onError, onDisconnect, handleSSEEvent])

  // Desconectar do SSE
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
      setConnected(false)
      onDisconnect?.()
    }
  }, [onDisconnect])

  // Reconectar
  const reconnect = useCallback(() => {
    disconnect()
    setTimeout(connect, 1000)
  }, [disconnect, connect])

  // Limpar eventos
  const clearEvents = useCallback(() => {
    setEvents([])
  }, [])

  // Effect para conectar/desconectar automaticamente
  useEffect(() => {
    if (enabled && (instanceId || organizationId || sessionId)) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [instanceId, organizationId, sessionId, enabled, connect, disconnect])

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
