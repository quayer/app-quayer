/**
 * Connections Controller
 *
 * Gerenciamento completo de conexões (WhatsApp, Instagram, Telegram, etc).
 *
 * Endpoints:
 * - POST   /connections          - Criar nova conexão
 * - GET    /connections          - Listar conexões da organização
 * - GET    /connections/:id      - Buscar conexão por ID
 * - PATCH  /connections/:id      - Atualizar conexão
 * - DELETE /connections/:id      - Deletar conexão
 * - POST   /connections/:id/connect    - Conectar/obter QR code
 * - POST   /connections/:id/disconnect - Desconectar
 * - GET    /connections/:id/status     - Status da conexão
 * - POST   /connections/:id/restart    - Reiniciar conexão
 *
 * @module features/connections/controllers
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { db } from '@/services/database'
import { encrypt, decrypt } from '@/lib/crypto'
import type { Prisma } from '@prisma/client'
import {
  publishConnectionStatus,
  publishConnectionCreated,
} from './connections-realtime.controller'
import { isValidPublicUrl } from '@/lib/validators/url.validator'

/**
 * Enums
 */
const ChannelEnum = z.enum(['WHATSAPP', 'INSTAGRAM', 'TELEGRAM', 'EMAIL'])
const ProviderEnum = z.enum([
  'WHATSAPP_WEB',
  'WHATSAPP_CLOUD_API',
  'WHATSAPP_BUSINESS_API',
  'INSTAGRAM_META',
  'TELEGRAM_BOT',
  'EMAIL_SMTP',
])
const ConnectionStatusEnum = z.enum([
  'PENDING',
  'CONNECTING',
  'CONNECTED',
  'DISCONNECTED',
  'ERROR',
])

/**
 * Schemas de validação
 */
/**
 * ✅ FIX: Schema com validação SSRF e sanitização
 */
const CreateConnectionSchema = z.object({
  name: z
    .string()
    .min(3, 'Nome deve ter no mínimo 3 caracteres')
    .max(50, 'Nome deve ter no máximo 50 caracteres')
    .regex(/^[a-zA-Z0-9\sçãõáéíóúâêôÇÃÕÁÉÍÓÚÂÊÔ\-_]+$/, 'Nome contém caracteres inválidos')
    .trim(),
  description: z.string().max(500).optional(),
  channel: ChannelEnum.default('WHATSAPP'),
  provider: ProviderEnum.default('WHATSAPP_WEB'),
  n8nWebhookUrl: z
    .string()
    .url('URL inválida')
    .refine((url) => isValidPublicUrl(url), {
      message: 'URL não permitida. Use uma URL pública válida (HTTPS em produção)',
    })
    .optional(),
  n8nFallbackUrl: z
    .string()
    .url('URL inválida')
    .refine((url) => isValidPublicUrl(url), {
      message: 'URL de fallback não permitida. Use uma URL pública válida',
    })
    .optional(),
  n8nWorkflowId: z.string().optional(),
  agentConfig: z.record(z.any()).optional(),
})

/**
 * ✅ FIX: Update schema com mesmas validações
 */
const UpdateConnectionSchema = z.object({
  name: z
    .string()
    .min(3, 'Nome deve ter no mínimo 3 caracteres')
    .max(50, 'Nome deve ter no máximo 50 caracteres')
    .regex(/^[a-zA-Z0-9\sçãõáéíóúâêôÇÃÕÁÉÍÓÚÂÊÔ\-_]+$/, 'Nome contém caracteres inválidos')
    .trim()
    .optional(),
  description: z.string().max(500).optional().nullable(),
  n8nWebhookUrl: z
    .string()
    .url('URL inválida')
    .refine((url) => isValidPublicUrl(url), {
      message: 'URL não permitida. Use uma URL pública válida',
    })
    .optional()
    .nullable(),
  n8nFallbackUrl: z
    .string()
    .url('URL inválida')
    .refine((url) => isValidPublicUrl(url), {
      message: 'URL de fallback não permitida',
    })
    .optional()
    .nullable(),
  n8nWorkflowId: z.string().optional().nullable(),
  agentConfig: z.record(z.any()).optional().nullable(),
})

const ListConnectionsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  channel: ChannelEnum.optional(),
  provider: ProviderEnum.optional(),
  status: ConnectionStatusEnum.optional(),
  search: z.string().optional(),
})

/**
 * Helpers para integração com uazapi
 */
const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || 'https://api.uazapi.com'
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || ''

interface UazapiInstanceResponse {
  instanceId: string
  token: string
  status: string
  qr?: string
}

async function createUazapiInstance(connectionId: string): Promise<UazapiInstanceResponse> {
  const response = await fetch(`${UAZAPI_BASE_URL}/instance/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${UAZAPI_ADMIN_TOKEN}`,
    },
    body: JSON.stringify({
      instanceName: connectionId,
      integration: 'WHATSAPP-BAILEYS',
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(`Failed to create uazapi instance: ${error.message || response.statusText}`)
  }

  return response.json()
}

async function connectUazapiInstance(instanceId: string, token: string): Promise<{ qr?: string }> {
  const response = await fetch(`${UAZAPI_BASE_URL}/instance/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      instanceId,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(`Failed to connect uazapi instance: ${error.message || response.statusText}`)
  }

  return response.json()
}

async function deleteUazapiInstance(instanceId: string): Promise<void> {
  const response = await fetch(`${UAZAPI_BASE_URL}/instance/delete`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${UAZAPI_ADMIN_TOKEN}`,
    },
    body: JSON.stringify({
      instanceId,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    console.warn(`Failed to delete uazapi instance: ${error.message || response.statusText}`)
  }
}

async function getUazapiInstanceStatus(
  instanceId: string,
  token: string
): Promise<{ status: string; qr?: string }> {
  const response = await fetch(`${UAZAPI_BASE_URL}/instance/status/${instanceId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(`Failed to get uazapi instance status: ${error.message || response.statusText}`)
  }

  return response.json()
}

/**
 * Connections Controller
 */
export const connectionsController = defineController({
  /**
   * Criar nova conexão
   *
   * POST /api/v1/connections
   */
  create: {
    method: 'POST',
    path: '/connections',
    schema: {
      body: CreateConnectionSchema,
    },
    handler: async ({ body, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { name, description, channel, provider, n8nWebhookUrl, n8nFallbackUrl, n8nWorkflowId, agentConfig } = body

      try {
        // ✅ FIX: Verificar se já existe conexão com mesmo nome na organização
        const existingConnection = await db.connection.findFirst({
          where: {
            name: name.trim(),
            organizationId: user.currentOrgId,
          },
        })

        if (existingConnection) {
          throw new Error('Já existe uma conexão com este nome na sua organização')
        }

        // Criar conexão no banco (sem uazapi ainda)
        const connection = await db.connection.create({
          data: {
            name,
            description,
            channel,
            provider,
            status: 'PENDING',
            organizationId: user.currentOrgId,
            n8nWebhookUrl,
            n8nFallbackUrl,
            n8nWorkflowId,
            agentConfig: agentConfig as Prisma.InputJsonValue,
          },
        })

        // Se for WhatsApp, criar instância no uazapi
        if (channel === 'WHATSAPP' && provider === 'WHATSAPP_WEB') {
          try {
            const uazapiInstance = await createUazapiInstance(connection.id)

            // Criptografar token antes de salvar
            const encryptedToken = encrypt(uazapiInstance.token)

            // Atualizar conexão com dados do uazapi
            await db.connection.update({
              where: { id: connection.id },
              data: {
                uazapiInstanceId: uazapiInstance.instanceId,
                uazapiToken: encryptedToken,
                status: 'CONNECTING',
              },
            })

            return {
              connection: {
                ...connection,
                uazapiInstanceId: uazapiInstance.instanceId,
                status: 'CONNECTING',
              },
              message: 'Conexão criada com sucesso. Use /connect para obter o QR code.',
            }
          } catch (error) {
            // Se falhar ao criar no uazapi, deletar do banco
            await db.connection.delete({ where: { id: connection.id } })
            throw error
          }
        }

        return {
          connection,
          message: 'Conexão criada com sucesso.',
        }
      } catch (error) {
        console.error('[Connections] Error creating connection:', error)
        throw new Error(error instanceof Error ? error.message : 'Failed to create connection')
      }
    },
  },

  /**
   * Listar conexões da organização
   *
   * GET /api/v1/connections
   */
  list: {
    method: 'GET',
    path: '/connections',
    schema: {
      query: ListConnectionsSchema,
    },
    handler: async ({ query, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { page, limit, channel, provider, status, search } = query
      const skip = (page - 1) * limit

      // Construir where clause
      const where: Prisma.ConnectionWhereInput = {
        organizationId: user.currentOrgId,
        deletedAt: null,
      }

      if (channel) {
        where.channel = channel
      }

      if (provider) {
        where.provider = provider
      }

      if (status) {
        where.status = status
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ]
      }

      const [connections, total] = await Promise.all([
        db.connection.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            name: true,
            description: true,
            channel: true,
            provider: true,
            status: true,
            n8nWebhookUrl: true,
            n8nWorkflowId: true,
            uazapiInstanceId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        db.connection.count({ where }),
      ])

      return {
        connections,
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
   * Buscar conexão por ID
   *
   * GET /api/v1/connections/:id
   */
  get: {
    method: 'GET',
    path: '/connections/:id',
    handler: async ({ params, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { id } = params as { id: string }

      const connection = await db.connection.findFirst({
        where: {
          id,
          organizationId: user.currentOrgId,
          deletedAt: null,
        },
        include: {
          _count: {
            select: {
              chatSessions: true,
              messages: true,
            },
          },
        },
      })

      if (!connection) {
        throw new Error('Connection not found')
      }

      // Não expor token criptografado
      const { uazapiToken, ...connectionData } = connection

      return {
        connection: connectionData,
      }
    },
  },

  /**
   * Atualizar conexão
   *
   * PATCH /api/v1/connections/:id
   */
  update: {
    method: 'PATCH',
    path: '/connections/:id',
    schema: {
      body: UpdateConnectionSchema,
    },
    handler: async ({ params, body, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { id } = params as { id: string }

      // Verificar se conexão existe e pertence à organização
      const existing = await db.connection.findFirst({
        where: {
          id,
          organizationId: user.currentOrgId,
          deletedAt: null,
        },
      })

      if (!existing) {
        throw new Error('Connection not found')
      }

      const { name, description, n8nWebhookUrl, n8nFallbackUrl, n8nWorkflowId, agentConfig } = body

      const connection = await db.connection.update({
        where: { id },
        data: {
          name,
          description,
          n8nWebhookUrl,
          n8nFallbackUrl,
          n8nWorkflowId,
          agentConfig: agentConfig as Prisma.InputJsonValue | undefined,
        },
      })

      // Não expor token criptografado
      const { uazapiToken, ...connectionData } = connection

      return {
        connection: connectionData,
        message: 'Conexão atualizada com sucesso',
      }
    },
  },

  /**
   * Deletar conexão
   *
   * DELETE /api/v1/connections/:id
   */
  delete: {
    method: 'DELETE',
    path: '/connections/:id',
    handler: async ({ params, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { id } = params as { id: string }

      // Verificar se conexão existe e pertence à organização
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

      // Deletar instância no uazapi se existir
      if (connection.uazapiInstanceId) {
        await deleteUazapiInstance(connection.uazapiInstanceId)
      }

      // Soft delete
      await db.connection.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: 'DISCONNECTED',
        },
      })

      return {
        message: 'Conexão deletada com sucesso',
      }
    },
  },

  /**
   * Conectar/obter QR code
   *
   * POST /api/v1/connections/:id/connect
   */
  connect: {
    method: 'POST',
    path: '/connections/:id/connect',
    handler: async ({ params, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { id } = params as { id: string }

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

      if (!connection.uazapiInstanceId || !connection.uazapiToken) {
        throw new Error('Connection not configured for WhatsApp')
      }

      try {
        // Descriptografar token
        const token = decrypt(connection.uazapiToken)

        // Conectar no uazapi
        const result = await connectUazapiInstance(connection.uazapiInstanceId, token)

        // Atualizar status
        await db.connection.update({
          where: { id },
          data: {
            status: result.qr ? 'CONNECTING' : 'CONNECTED',
          },
        })

        return {
          qr: result.qr,
          status: result.qr ? 'CONNECTING' : 'CONNECTED',
          message: result.qr
            ? 'Escaneie o QR code no WhatsApp'
            : 'Conexão já estabelecida',
        }
      } catch (error) {
        console.error('[Connections] Error connecting:', error)
        await db.connection.update({
          where: { id },
          data: { status: 'ERROR' },
        })
        throw new Error(error instanceof Error ? error.message : 'Failed to connect')
      }
    },
  },

  /**
   * Desconectar
   *
   * POST /api/v1/connections/:id/disconnect
   */
  disconnect: {
    method: 'POST',
    path: '/connections/:id/disconnect',
    handler: async ({ params, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { id } = params as { id: string }

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

      if (!connection.uazapiInstanceId) {
        throw new Error('Connection not configured for WhatsApp')
      }

      try {
        // Deletar instância no uazapi
        await deleteUazapiInstance(connection.uazapiInstanceId)

        // Atualizar status
        await db.connection.update({
          where: { id },
          data: {
            status: 'DISCONNECTED',
            uazapiInstanceId: null,
            uazapiToken: null,
          },
        })

        return {
          message: 'Desconectado com sucesso',
        }
      } catch (error) {
        console.error('[Connections] Error disconnecting:', error)
        throw new Error(error instanceof Error ? error.message : 'Failed to disconnect')
      }
    },
  },

  /**
   * Verificar status da conexão
   *
   * GET /api/v1/connections/:id/status
   */
  getStatus: {
    method: 'GET',
    path: '/connections/:id/status',
    handler: async ({ params, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { id } = params as { id: string }

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

      if (!connection.uazapiInstanceId || !connection.uazapiToken) {
        return {
          status: connection.status,
          connected: false,
        }
      }

      try {
        // Descriptografar token
        const token = decrypt(connection.uazapiToken)

        // Verificar status no uazapi
        const result = await getUazapiInstanceStatus(connection.uazapiInstanceId, token)

        // Atualizar status no banco se mudou
        let newStatus: typeof connection.status = connection.status
        if (result.status === 'open') {
          newStatus = 'CONNECTED'
        } else if (result.status === 'connecting') {
          newStatus = 'CONNECTING'
        } else if (result.status === 'close') {
          newStatus = 'DISCONNECTED'
        }

        if (newStatus !== connection.status) {
          await db.connection.update({
            where: { id },
            data: { status: newStatus },
          })
        }

        return {
          status: newStatus,
          connected: result.status === 'open',
          qr: result.qr,
          uazapiStatus: result.status,
        }
      } catch (error) {
        console.error('[Connections] Error getting status:', error)
        return {
          status: 'ERROR',
          connected: false,
          error: error instanceof Error ? error.message : 'Failed to get status',
        }
      }
    },
  },

  /**
   * Reiniciar conexão
   *
   * POST /api/v1/connections/:id/restart
   */
  restart: {
    method: 'POST',
    path: '/connections/:id/restart',
    handler: async ({ params, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { id } = params as { id: string }

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

      if (!connection.uazapiInstanceId) {
        throw new Error('Connection not configured for WhatsApp')
      }

      try {
        // Deletar instância antiga
        await deleteUazapiInstance(connection.uazapiInstanceId)

        // Criar nova instância
        const uazapiInstance = await createUazapiInstance(connection.id)

        // Criptografar token
        const encryptedToken = encrypt(uazapiInstance.token)

        // Atualizar conexão
        await db.connection.update({
          where: { id },
          data: {
            uazapiInstanceId: uazapiInstance.instanceId,
            uazapiToken: encryptedToken,
            status: 'CONNECTING',
          },
        })

        return {
          message: 'Conexão reiniciada com sucesso. Use /connect para obter novo QR code.',
        }
      } catch (error) {
        console.error('[Connections] Error restarting connection:', error)
        await db.connection.update({
          where: { id },
          data: { status: 'ERROR' },
        })
        throw new Error(error instanceof Error ? error.message : 'Failed to restart connection')
      }
    },
  },
})
