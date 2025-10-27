/**
 * UAZ API Webhooks Controller
 *
 * Orquestrador central de webhooks do uazapi.
 * Recebe eventos de todas as conexões e roteia para n8n workflows.
 *
 * Fluxo:
 * 1. uazapi envia evento para /api/v1/webhooks/uazapi (webhook global)
 * 2. Identificar a conexão (instanceId → connectionId)
 * 3. Buscar configuração n8n da conexão
 * 4. Rotear evento para n8n workflow específico
 * 5. Aplicar fallback se necessário
 * 6. Registrar log de chamada
 *
 * @module features/webhooks/controllers
 */

import { defineController } from '@igniter-js/core/controller'
import { z } from 'zod'
import { check as checkRateLimit } from '@/lib/rate-limit'
import { db } from '@/services/database'
import type { Prisma } from '@prisma/client'

/**
 * Schema de validação para eventos do uazapi
 */
const UazapiEventSchema = z.object({
  // Identificação
  instanceId: z.string(),
  event: z.enum(['messages', 'messages_update', 'connection']),

  // Dados do evento
  data: z.object({
    key: z
      .object({
        remoteJid: z.string(),
        id: z.string(),
        fromMe: z.boolean().optional(),
      })
      .optional(),
    messageType: z.string().optional(),
    message: z.any().optional(),
    pushName: z.string().optional(),
    status: z.string().optional(),
    state: z.string().optional(),
  }),

  // Metadados
  timestamp: z.number().optional(),
  wasSentByApi: z.boolean().optional(),
})

type UazapiEvent = z.infer<typeof UazapiEventSchema>

/**
 * Resultado do roteamento para n8n
 */
interface N8nRouteResult {
  success: boolean
  url: string | null
  latency: number
  error?: string
  fallbackUsed?: boolean
}

/**
 * Rotear evento para n8n workflow
 */
async function routeToN8n(
  connectionId: string,
  event: UazapiEvent
): Promise<N8nRouteResult> {
  const startTime = Date.now()

  try {
    // Buscar configuração da conexão
    const connection = await db.connection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        name: true,
        n8nWebhookUrl: true,
        n8nFallbackUrl: true,
        n8nWorkflowId: true,
        agentConfig: true,
        organizationId: true,
      },
    })

    if (!connection) {
      return {
        success: false,
        url: null,
        latency: Date.now() - startTime,
        error: 'Connection not found',
      }
    }

    // Verificar se tem n8n configurado
    const targetUrl = connection.n8nWebhookUrl || connection.n8nFallbackUrl

    if (!targetUrl) {
      console.warn(`[Webhook] Connection ${connectionId} has no n8n URL configured`)
      return {
        success: false,
        url: null,
        latency: Date.now() - startTime,
        error: 'No n8n webhook URL configured',
      }
    }

    // Rate limiting por conexão
    const rateLimitKey = `n8n:${connectionId}`
    const rateLimit = await checkRateLimit(rateLimitKey, {
      window: '1m',
      max: 60, // 60 requests por minuto por conexão
    })

    if (!rateLimit.allowed) {
      console.warn(`[Webhook] Rate limit exceeded for connection ${connectionId}`)
      return {
        success: false,
        url: targetUrl,
        latency: Date.now() - startTime,
        error: `Rate limit exceeded. Try again in ${Math.ceil(rateLimit.reset / 1000)}s`,
      }
    }

    // Preparar payload para n8n
    const payload = {
      event: event.event,
      instanceId: event.instanceId,
      connectionId: connection.id,
      connectionName: connection.name,
      organizationId: connection.organizationId,
      data: event.data,
      timestamp: event.timestamp || Date.now(),
      agentConfig: connection.agentConfig as Prisma.JsonObject | null,
    }

    // Enviar para n8n
    console.log(`[Webhook] Routing to n8n: ${targetUrl}`)

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Connection-Id': connectionId,
        'X-Workflow-Id': connection.n8nWorkflowId || '',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000), // 30s timeout
    })

    const latency = Date.now() - startTime
    const success = response.ok

    // Registrar log
    await db.n8nCallLog.create({
      data: {
        connectionId,
        url: targetUrl,
        payload: payload as Prisma.InputJsonValue,
        response: {
          status: response.status,
          statusText: response.statusText,
        } as Prisma.InputJsonValue,
        success,
        latency,
      },
    })

    // Se falhou e tem fallback, tentar fallback
    if (!success && connection.n8nFallbackUrl && targetUrl !== connection.n8nFallbackUrl) {
      console.warn(
        `[Webhook] Primary n8n failed (${response.status}), trying fallback: ${connection.n8nFallbackUrl}`
      )

      const fallbackResponse = await fetch(connection.n8nFallbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Connection-Id': connectionId,
          'X-Workflow-Id': connection.n8nWorkflowId || '',
          'X-Fallback': 'true',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      })

      const fallbackLatency = Date.now() - startTime
      const fallbackSuccess = fallbackResponse.ok

      await db.n8nCallLog.create({
        data: {
          connectionId,
          url: connection.n8nFallbackUrl,
          payload: payload as Prisma.InputJsonValue,
          response: {
            status: fallbackResponse.status,
            statusText: fallbackResponse.statusText,
            fallback: true,
          } as Prisma.InputJsonValue,
          success: fallbackSuccess,
          latency: fallbackLatency,
        },
      })

      return {
        success: fallbackSuccess,
        url: connection.n8nFallbackUrl,
        latency: fallbackLatency,
        fallbackUsed: true,
      }
    }

    return {
      success,
      url: targetUrl,
      latency,
    }
  } catch (error) {
    const latency = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    console.error(`[Webhook] Error routing to n8n:`, error)

    return {
      success: false,
      url: null,
      latency,
      error: errorMessage,
    }
  }
}

/**
 * UAZ API Webhooks Controller
 */
export const uazapiWebhooksController = defineController({
  /**
   * Receber webhook global do uazapi
   *
   * POST /api/v1/webhooks/uazapi
   */
  receiveUazapi: {
    method: 'POST',
    path: '/webhooks/uazapi',
    public: true, // Público para receber do uazapi
    schema: {
      body: UazapiEventSchema,
    },
    handler: async ({ body }) => {
      const event = body

      console.log(`[Webhook] Received event: ${event.event} from instance: ${event.instanceId}`)

      try {
        // Buscar conexão pelo uazapiInstanceId
        const connection = await db.connection.findUnique({
          where: { uazapiInstanceId: event.instanceId },
          select: { id: true, name: true, organizationId: true },
        })

        if (!connection) {
          console.warn(`[Webhook] Connection not found for instanceId: ${event.instanceId}`)
          return {
            success: false,
            error: 'Connection not found',
            instanceId: event.instanceId,
          }
        }

        // Rotear para n8n
        const result = await routeToN8n(connection.id, event)

        return {
          success: result.success,
          connectionId: connection.id,
          connectionName: connection.name,
          n8nUrl: result.url,
          latency: result.latency,
          fallbackUsed: result.fallbackUsed,
          error: result.error,
        }
      } catch (error) {
        console.error('[Webhook] Error processing webhook:', error)

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          instanceId: event.instanceId,
        }
      }
    },
  },

  /**
   * Listar logs de chamadas n8n
   *
   * GET /api/v1/webhooks/n8n-logs
   */
  listN8nLogs: {
    method: 'GET',
    path: '/webhooks/n8n-logs',
    schema: {
      query: z.object({
        connectionId: z.string().optional(),
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
        successOnly: z.coerce.boolean().optional(),
      }),
    },
    handler: async ({ query, context }) => {
      const { connectionId, page, limit, successOnly } = query
      const skip = (page - 1) * limit

      // Verificar permissões de organização
      const user = context.user
      if (!user) {
        throw new Error('Unauthorized')
      }

      // Construir where clause
      const where: Prisma.N8nCallLogWhereInput = {}

      if (connectionId) {
        // Verificar se a conexão pertence à organização do usuário
        const connection = await db.connection.findFirst({
          where: {
            id: connectionId,
            organizationId: user.currentOrgId!,
          },
        })

        if (!connection) {
          throw new Error('Connection not found or access denied')
        }

        where.connectionId = connectionId
      } else {
        // Buscar apenas conexões da organização do usuário
        where.connection = {
          organizationId: user.currentOrgId!,
        }
      }

      if (successOnly !== undefined) {
        where.success = successOnly
      }

      const [logs, total] = await Promise.all([
        db.n8nCallLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            connection: {
              select: {
                id: true,
                name: true,
                channel: true,
                provider: true,
              },
            },
          },
        }),
        db.n8nCallLog.count({ where }),
      ])

      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }
    },
  },

  /**
   * Estatísticas de n8n
   *
   * GET /api/v1/webhooks/n8n-stats
   */
  getN8nStats: {
    method: 'GET',
    path: '/webhooks/n8n-stats',
    schema: {
      query: z.object({
        connectionId: z.string().optional(),
        hours: z.coerce.number().min(1).max(168).default(24), // Últimas 24 horas por padrão
      }),
    },
    handler: async ({ query, context }) => {
      const { connectionId, hours } = query
      const user = context.user

      if (!user) {
        throw new Error('Unauthorized')
      }

      // Construir where clause
      const where: Prisma.N8nCallLogWhereInput = {
        createdAt: {
          gte: new Date(Date.now() - hours * 60 * 60 * 1000),
        },
      }

      if (connectionId) {
        // Verificar se a conexão pertence à organização do usuário
        const connection = await db.connection.findFirst({
          where: {
            id: connectionId,
            organizationId: user.currentOrgId!,
          },
        })

        if (!connection) {
          throw new Error('Connection not found or access denied')
        }

        where.connectionId = connectionId
      } else {
        // Buscar apenas conexões da organização do usuário
        where.connection = {
          organizationId: user.currentOrgId!,
        }
      }

      // Buscar estatísticas
      const [total, successful, failed, avgLatency] = await Promise.all([
        db.n8nCallLog.count({ where }),
        db.n8nCallLog.count({ where: { ...where, success: true } }),
        db.n8nCallLog.count({ where: { ...where, success: false } }),
        db.n8nCallLog.aggregate({
          where,
          _avg: { latency: true },
        }),
      ])

      return {
        period: `${hours}h`,
        total,
        successful,
        failed,
        successRate: total > 0 ? ((successful / total) * 100).toFixed(2) : '0.00',
        avgLatency: Math.round(avgLatency._avg.latency || 0),
      }
    },
  },
})
