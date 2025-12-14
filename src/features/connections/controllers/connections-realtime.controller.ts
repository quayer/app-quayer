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

// NOTE: connectionsRealtimeController disabled - requires @igniter-js/core/controller which doesn't exist
// The helper functions above (publishConnectionStatus, publishConnectionCreated, publishN8nLog) are still available
