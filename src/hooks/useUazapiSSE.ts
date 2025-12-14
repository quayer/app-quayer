'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Tipos de eventos SSE do UAZapi
 *
 * O UAZapi emite eventos em tempo real para:
 * - connection: Mudanças no estado da conexão
 * - messages: Novas mensagens recebidas
 * - messages_update: Atualizações em mensagens existentes
 * - call: Eventos de chamadas VoIP
 * - contacts: Atualizações na agenda de contatos
 * - presence: Alterações no status de presença
 * - groups: Modificações em grupos
 * - labels: Gerenciamento de etiquetas
 * - chats: Eventos de conversas
 * - history: Recebimento de histórico de mensagens
 */
export type UAZapiEventType =
  | 'connection'
  | 'messages'
  | 'messages_update'
  | 'call'
  | 'contacts'
  | 'presence'
  | 'groups'
  | 'labels'
  | 'chats'
  | 'history'
  | 'error'
  | 'heartbeat'

export interface UAZapiSSEEvent<T = any> {
  event: UAZapiEventType
  instanceId?: string
  instanceName?: string
  data: T
  timestamp: string
}

export interface UseUazapiSSEOptions {
  /** Token da instância para conectar */
  instanceToken: string
  /** Habilitar conexão SSE */
  enabled?: boolean
  /** Callback para cada evento recebido */
  onEvent?: (event: UAZapiSSEEvent) => void
  /** Callback quando conectar */
  onConnect?: () => void
  /** Callback quando desconectar */
  onDisconnect?: () => void
  /** Callback para erros */
  onError?: (error: Event | Error) => void
  /** Reconectar automaticamente em caso de erro */
  autoReconnect?: boolean
  /** Delay para reconexão em ms */
  reconnectDelay?: number
  /** Auto-invalidar queries do React Query ao receber eventos */
  autoInvalidate?: boolean
  /** Query keys para invalidar em cada tipo de evento */
  invalidateMap?: Partial<Record<UAZapiEventType, string[]>>
}

const DEFAULT_INVALIDATE_MAP: Partial<Record<UAZapiEventType, string[]>> = {
  connection: ['all-instances', 'instance'],
  messages: ['messages', 'sessions'],
  messages_update: ['messages'],
  contacts: ['contacts'],
  chats: ['sessions', 'chats'],
  labels: ['labels', 'sessions', 'contacts'],
  groups: ['groups'],
}

/**
 * Hook para conectar ao SSE do UAZapi
 *
 * O UAZapi fornece um endpoint SSE por instância que emite
 * eventos em tempo real conforme acontecem.
 *
 * @example
 * // Conectar ao SSE de uma instância
 * const { connected, events, reconnect } = useUazapiSSE({
 *   instanceToken: 'token_da_instancia',
 *   onEvent: (event) => {
 *     if (event.event === 'messages') {
 *       console.log('Nova mensagem:', event.data)
 *     }
 *   },
 *   autoInvalidate: true,
 * })
 */
export function useUazapiSSE(options: UseUazapiSSEOptions) {
  const {
    instanceToken,
    enabled = true,
    onEvent,
    onConnect,
    onDisconnect,
    onError,
    autoReconnect = true,
    reconnectDelay = 5000,
    autoInvalidate = false,
    invalidateMap = DEFAULT_INVALIDATE_MAP,
  } = options

  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<UAZapiSSEEvent[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const queryClient = useQueryClient()

  // URL base do UAZapi
  const uazapiUrl = process.env.NEXT_PUBLIC_UAZAPI_URL || 'https://api.uazapi.app'

  // Construir URL do SSE
  const getSSEUrl = useCallback(() => {
    if (!instanceToken) return null
    return `${uazapiUrl}/sse?token=${instanceToken}`
  }, [uazapiUrl, instanceToken])

  // Handler para eventos SSE
  const handleSSEEvent = useCallback(
    (eventType: UAZapiEventType, rawData: string) => {
      try {
        const data = JSON.parse(rawData)
        const event: UAZapiSSEEvent = {
          event: eventType,
          instanceId: data.instanceId,
          instanceName: data.instanceName,
          data: data.data || data,
          timestamp: new Date().toISOString(),
        }

        // Adicionar ao histórico (mantendo últimos 100 eventos)
        setEvents((prev) => [...prev.slice(-99), event])

        // Chamar callback
        onEvent?.(event)

        // Auto-invalidar queries relacionadas
        if (autoInvalidate && invalidateMap[eventType]) {
          invalidateMap[eventType]?.forEach((queryKey) => {
            queryClient.invalidateQueries({ queryKey: [queryKey] })
          })
        }
      } catch (err) {
        console.error(`[UAZapi SSE] Error parsing ${eventType} event:`, err)
      }
    },
    [autoInvalidate, invalidateMap, onEvent, queryClient]
  )

  // Conectar ao SSE
  const connect = useCallback(() => {
    const url = getSSEUrl()
    if (!url || !enabled) return

    // Fechar conexão existente
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    // Limpar timeout de reconexão
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    try {
      console.log('[UAZapi SSE] Conectando ao SSE:', url)
      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        console.log('[UAZapi SSE] Conexão estabelecida')
        setConnected(true)
        setError(null)
        setReconnectAttempts(0)
        onConnect?.()
      }

      eventSource.onerror = (e) => {
        console.error('[UAZapi SSE] Erro na conexão:', e)
        setConnected(false)
        setError(new Error('SSE connection error'))
        onError?.(e)
        onDisconnect?.()

        // Auto-reconectar
        if (autoReconnect && enabled) {
          setReconnectAttempts((prev) => prev + 1)
          const delay = Math.min(reconnectDelay * Math.pow(1.5, reconnectAttempts), 30000)
          console.log(`[UAZapi SSE] Reconectando em ${delay}ms...`)
          reconnectTimeoutRef.current = setTimeout(connect, delay)
        }
      }

      // Listener para mensagem genérica
      eventSource.onmessage = (e: MessageEvent) => {
        handleSSEEvent('messages' as UAZapiEventType, e.data)
      }

      // Listeners para eventos específicos do UAZapi
      const eventTypes: UAZapiEventType[] = [
        'connection',
        'messages',
        'messages_update',
        'call',
        'contacts',
        'presence',
        'groups',
        'labels',
        'chats',
        'history',
      ]

      eventTypes.forEach((eventType) => {
        eventSource.addEventListener(eventType, (e: MessageEvent) => {
          handleSSEEvent(eventType, e.data)
        })
      })

      // Listener para heartbeat (keep-alive)
      eventSource.addEventListener('heartbeat', () => {
        // Apenas atualizar timestamp interno
        setEvents((prev) => {
          const heartbeatEvent: UAZapiSSEEvent = {
            event: 'heartbeat',
            data: {},
            timestamp: new Date().toISOString(),
          }
          return [...prev.slice(-99), heartbeatEvent]
        })
      })
    } catch (err) {
      console.error('[UAZapi SSE] Erro ao criar EventSource:', err)
      setError(err instanceof Error ? err : new Error('Failed to connect SSE'))
      onError?.(err instanceof Error ? err : new Error('Failed to connect SSE'))
    }
  }, [
    getSSEUrl,
    enabled,
    onConnect,
    onError,
    onDisconnect,
    handleSSEEvent,
    autoReconnect,
    reconnectDelay,
    reconnectAttempts,
  ])

  // Desconectar do SSE
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (eventSourceRef.current) {
      console.log('[UAZapi SSE] Desconectando...')
      eventSourceRef.current.close()
      eventSourceRef.current = null
      setConnected(false)
      onDisconnect?.()
    }
  }, [onDisconnect])

  // Reconectar manualmente
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
    if (enabled && instanceToken) {
      connect()
    }

    return () => {
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceToken, enabled])

  return {
    connected,
    events,
    error,
    reconnectAttempts,
    connect,
    disconnect,
    reconnect,
    clearEvents,
    lastEvent: events[events.length - 1] || null,
    // Filtrar eventos por tipo
    getEventsByType: (type: UAZapiEventType) => events.filter((e) => e.event === type),
  }
}

/**
 * Hook simplificado para status de conexão via SSE
 */
export function useUazapiConnectionStatus(instanceToken: string | undefined) {
  const [connectionStatus, setConnectionStatus] = useState<string>('unknown')

  const { connected, error } = useUazapiSSE({
    instanceToken: instanceToken || '',
    enabled: !!instanceToken,
    onEvent: (event) => {
      if (event.event === 'connection' && event.data?.status) {
        setConnectionStatus(event.data.status)
      }
    },
  })

  return {
    connectionStatus,
    sseConnected: connected,
    sseError: error,
  }
}

/**
 * Hook para escutar mensagens em tempo real via SSE
 */
export function useUazapiMessages(
  instanceToken: string | undefined,
  options?: {
    onMessage?: (message: any) => void
    onMessageUpdate?: (update: any) => void
  }
) {
  const [messages, setMessages] = useState<any[]>([])

  const { connected, error } = useUazapiSSE({
    instanceToken: instanceToken || '',
    enabled: !!instanceToken,
    onEvent: (event) => {
      if (event.event === 'messages') {
        setMessages((prev) => [...prev, event.data])
        options?.onMessage?.(event.data)
      }
      if (event.event === 'messages_update') {
        options?.onMessageUpdate?.(event.data)
      }
    },
    autoInvalidate: true,
  })

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    connected,
    error,
    clearMessages,
  }
}
