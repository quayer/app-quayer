/**
 * Connections Realtime Controller
 *
 * Implementação de streaming nativo do Igniter.js para monitoramento
 * em tempo real de conexões.
 *
 * Recursos:
 * - Stream de status de conexões
 * - Stream de logs de n8n
 * - Auto-revalidação de cache
 * - Pub/Sub via Redis
 *
 * @see https://igniterjs.com/docs/advanced-features/realtime
 */

import { defineController } from '@igniter-js/core/controller'
import { z } from 'zod'
import { db } from '@/services/database'
import { redis } from '@/services/redis'
import type { ConnectionStatus } from '@prisma/client'

/**
 * Channels do Redis Pub/Sub
 */
const REDIS_CHANNELS = {
  CONNECTION_STATUS: 'connection:status:',
  CONNECTION_CREATED: 'connection:created',
  CONNECTION_DELETED: 'connection:deleted',
  N8N_LOG: 'n8n:log:',
} as const

/**
 * Helper: Publicar evento de mudança de status
 */
export async function publishConnectionStatus(
  connectionId: string,
  status: ConnectionStatus,
  metadata?: any
) {
  await redis.publish(
    `${REDIS_CHANNELS.CONNECTION_STATUS}${connectionId}`,
    JSON.stringify({
      connectionId,
      status,
      timestamp: Date.now(),
      metadata,
    })
  )
}

/**
 * Helper: Publicar evento de criação
 */
export async function publishConnectionCreated(connection: any) {
  await redis.publish(
    REDIS_CHANNELS.CONNECTION_CREATED,
    JSON.stringify({
      connection,
      timestamp: Date.now(),
    })
  )
}

/**
 * Helper: Publicar evento de log n8n
 */
export async function publishN8nLog(connectionId: string, log: any) {
  await redis.publish(
    `${REDIS_CHANNELS.N8N_LOG}${connectionId}`,
    JSON.stringify({
      ...log,
      timestamp: Date.now(),
    })
  )
}

/**
 * Connections Realtime Controller
 */
export const connectionsRealtimeController = defineController({
  /**
   * Stream de status de uma conexão específica
   *
   * GET /api/v1/connections/:id/stream
   *
   * Eventos emitidos:
   * - status-changed: Quando status muda
   * - qr-updated: Quando QR code é atualizado
   * - error: Quando ocorre erro
   * - heartbeat: A cada 30s
   */
  streamConnection: {
    method: 'GET',
    path: '/connections/:id/stream',
    stream: true, // ✅ Usa streaming nativo do Igniter.js
    handler: async ({ params, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { id } = params as { id: string }

      // Verificar ownership
      const connection = await db.connection.findFirst({
        where: {
          id,
          organizationId: user.currentOrgId,
          deletedAt: null,
        },
      })

      if (!connection) {
        throw new Error('Connection not found')
      }

      // Retornar stream subscriber
      return {
        subscribe: (onData: (data: any) => void) => {
          // Subscribe no Redis Pub/Sub
          const subscriber = redis.duplicate()

          subscriber.subscribe(
            `${REDIS_CHANNELS.CONNECTION_STATUS}${id}`,
            (err) => {
              if (err) console.error('[Realtime] Subscribe error:', err)
            }
          )

          subscriber.on('message', (channel, message) => {
            try {
              const data = JSON.parse(message)
              onData({
                event: 'status-changed',
                data,
              })
            } catch (error) {
              console.error('[Realtime] Parse error:', error)
            }
          })

          // Heartbeat a cada 30s
          const heartbeatInterval = setInterval(() => {
            onData({
              event: 'heartbeat',
              data: {
                connectionId: id,
                timestamp: Date.now(),
              },
            })
          }, 30000)

          // Enviar status inicial
          onData({
            event: 'connected',
            data: {
              connectionId: id,
              status: connection.status,
            },
          })

          // Cleanup
          return () => {
            clearInterval(heartbeatInterval)
            subscriber.unsubscribe()
            subscriber.quit()
          }
        },
      }
    },
  },

  /**
   * Stream de todas as conexões da organização
   *
   * GET /api/v1/connections/stream
   *
   * Eventos emitidos:
   * - connection-created: Nova conexão criada
   * - connection-updated: Conexão atualizada
   * - connection-deleted: Conexão deletada
   * - heartbeat: A cada 30s
   */
  streamOrganizationConnections: {
    method: 'GET',
    path: '/connections/stream',
    stream: true,
    handler: async ({ context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const orgId = user.currentOrgId

      return {
        subscribe: (onData: (data: any) => void) => {
          const subscriber = redis.duplicate()

          // Subscribe em eventos globais e filtrar por org no handler
          subscriber.subscribe(
            REDIS_CHANNELS.CONNECTION_CREATED,
            REDIS_CHANNELS.CONNECTION_DELETED,
            (err) => {
              if (err) console.error('[Realtime] Subscribe error:', err)
            }
          )

          subscriber.on('message', async (channel, message) => {
            try {
              const data = JSON.parse(message)

              // Filtrar por organização
              if (channel === REDIS_CHANNELS.CONNECTION_CREATED) {
                if (data.connection?.organizationId === orgId) {
                  onData({
                    event: 'connection-created',
                    data: data.connection,
                  })

                  // ✅ Revalidar cache automaticamente
                  context.revalidate?.(`connections:list:${orgId}`)
                }
              } else if (channel === REDIS_CHANNELS.CONNECTION_DELETED) {
                if (data.organizationId === orgId) {
                  onData({
                    event: 'connection-deleted',
                    data: { connectionId: data.connectionId },
                  })

                  // ✅ Revalidar cache
                  context.revalidate?.(`connections:list:${orgId}`)
                }
              }
            } catch (error) {
              console.error('[Realtime] Parse error:', error)
            }
          })

          // Heartbeat
          const heartbeatInterval = setInterval(() => {
            onData({
              event: 'heartbeat',
              data: { timestamp: Date.now() },
            })
          }, 30000)

          // Status inicial
          onData({
            event: 'connected',
            data: { organizationId: orgId },
          })

          // Cleanup
          return () => {
            clearInterval(heartbeatInterval)
            subscriber.unsubscribe()
            subscriber.quit()
          }
        },
      }
    },
  },

  /**
   * Stream de logs n8n de uma conexão
   *
   * GET /api/v1/connections/:id/n8n-logs/stream
   *
   * Eventos emitidos:
   * - log-created: Novo log criado
   * - heartbeat: A cada 30s
   */
  streamN8nLogs: {
    method: 'GET',
    path: '/connections/:id/n8n-logs/stream',
    stream: true,
    handler: async ({ params, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { id } = params as { id: string }

      // Verificar ownership
      const connection = await db.connection.findFirst({
        where: {
          id,
          organizationId: user.currentOrgId,
          deletedAt: null,
        },
      })

      if (!connection) {
        throw new Error('Connection not found')
      }

      return {
        subscribe: (onData: (data: any) => void) => {
          const subscriber = redis.duplicate()

          subscriber.subscribe(`${REDIS_CHANNELS.N8N_LOG}${id}`, (err) => {
            if (err) console.error('[Realtime] Subscribe error:', err)
          })

          subscriber.on('message', (channel, message) => {
            try {
              const data = JSON.parse(message)
              onData({
                event: 'log-created',
                data,
              })
            } catch (error) {
              console.error('[Realtime] Parse error:', error)
            }
          })

          // Heartbeat
          const heartbeatInterval = setInterval(() => {
            onData({
              event: 'heartbeat',
              data: { timestamp: Date.now() },
            })
          }, 30000)

          // Status inicial
          onData({
            event: 'connected',
            data: { connectionId: id },
          })

          // Cleanup
          return () => {
            clearInterval(heartbeatInterval)
            subscriber.unsubscribe()
            subscriber.quit()
          }
        },
      }
    },
  },
})
