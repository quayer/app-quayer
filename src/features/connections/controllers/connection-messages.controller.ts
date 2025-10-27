/**
 * Connection Messages Controller
 *
 * Envio direto de mensagens via conexão (sem necessidade de sessão existente).
 * Complementa o messages.controller.ts existente que trabalha com sessões.
 *
 * Use cases:
 * - Envio de mensagens de marketing/notificações em massa
 * - Templates de WhatsApp Business
 * - Mensagens automáticas de n8n
 * - Testes de conexão
 *
 * @module features/connections/controllers
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { db } from '@/services/database'
import { decrypt } from '@/lib/crypto'
import { check as checkRateLimit } from '@/lib/rate-limit'

/**
 * Schemas
 */
const SendTextMessageSchema = z.object({
  to: z.string().min(1).describe('Número do destinatário (formato: 5511999999999)'),
  text: z.string().min(1).max(4096).describe('Texto da mensagem'),
})

const SendMediaMessageSchema = z.object({
  to: z.string().min(1).describe('Número do destinatário'),
  mediaType: z.enum(['image', 'video', 'audio', 'document']),
  mediaUrl: z.string().url().describe('URL pública da mídia'),
  caption: z.string().max(1024).optional().describe('Legenda da mídia'),
  filename: z.string().optional().describe('Nome do arquivo (para documents)'),
})

const SendTemplateMessageSchema = z.object({
  to: z.string().min(1).describe('Número do destinatário'),
  templateName: z.string().min(1).describe('Nome do template'),
  languageCode: z.string().default('pt_BR').describe('Código do idioma (ex: pt_BR, en_US)'),
  components: z.array(z.any()).optional().describe('Componentes do template (header, body, buttons)'),
})

const SendButtonsMessageSchema = z.object({
  to: z.string().min(1).describe('Número do destinatário'),
  text: z.string().min(1).max(1024).describe('Texto da mensagem'),
  buttons: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().max(20),
      })
    )
    .min(1)
    .max(3)
    .describe('Botões (máximo 3)'),
  footer: z.string().max(60).optional().describe('Rodapé opcional'),
})

const SendListMessageSchema = z.object({
  to: z.string().min(1).describe('Número do destinatário'),
  text: z.string().min(1).max(1024).describe('Texto da mensagem'),
  buttonText: z.string().max(20).describe('Texto do botão da lista'),
  sections: z
    .array(
      z.object({
        title: z.string(),
        rows: z.array(
          z.object({
            id: z.string(),
            title: z.string().max(24),
            description: z.string().max(72).optional(),
          })
        ),
      })
    )
    .min(1)
    .describe('Seções da lista'),
  footer: z.string().max(60).optional().describe('Rodapé opcional'),
})

/**
 * Helper: Enviar mensagem via uazapi
 */
async function sendViaUazapi(
  connectionId: string,
  endpoint: string,
  payload: any
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Buscar conexão
    const connection = await db.connection.findUnique({
      where: { id: connectionId },
      select: {
        uazapiInstanceId: true,
        uazapiToken: true,
        status: true,
      },
    })

    if (!connection) {
      return { success: false, error: 'Connection not found' }
    }

    if (connection.status !== 'CONNECTED') {
      return { success: false, error: `Connection is ${connection.status}` }
    }

    if (!connection.uazapiInstanceId || !connection.uazapiToken) {
      return { success: false, error: 'Connection not configured' }
    }

    // Descriptografar token
    const token = decrypt(connection.uazapiToken)

    // Enviar para uazapi
    const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || 'https://api.uazapi.com'
    const url = `${UAZAPI_BASE_URL}${endpoint}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        instanceId: connection.uazapiInstanceId,
        ...payload,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      return {
        success: false,
        error: error.message || `HTTP ${response.status}`,
      }
    }

    const result = await response.json()
    return {
      success: true,
      messageId: result.key?.id || result.messageId,
    }
  } catch (error) {
    console.error('[ConnectionMessages] Error sending message:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Connection Messages Controller
 */
export const connectionMessagesController = igniter.controller({
  name: 'connection-messages',
  path: '/connections/:connectionId/messages',
  actions: {
    /**
     * Enviar mensagem de texto
     *
     * POST /api/v1/connection-messages/text
     */
    sendText: igniter.mutation({
      path: '/text',
      method: 'POST',
      body: SendTextMessageSchema,
      params: z.object({
        connectionId: z.string(),
      }),
      handler: async ({ request, response, context }) => {
        const { params, body } = request
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { connectionId } = params as { connectionId: string }
      const { to, text } = body

      // Verificar ownership da conexão
      const connection = await db.connection.findFirst({
        where: {
          id: connectionId,
          organizationId: user.currentOrgId,
          deletedAt: null,
        },
      })

      if (!connection) {
        throw new Error('Connection not found')
      }

      // Rate limiting
      const rateLimitKey = `connection:${connectionId}:messages`
      const rateLimit = await checkRateLimit(rateLimitKey, {
        window: '1m',
        max: 30, // 30 mensagens por minuto
      })

      if (!rateLimit.allowed) {
        throw new Error(
          `Rate limit exceeded. Try again in ${Math.ceil(rateLimit.reset / 1000)}s`
        )
      }

      // Enviar via uazapi
      const result = await sendViaUazapi(connectionId, '/message/sendText', {
        number: to,
        text,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to send message')
      }

      return {
        success: true,
        messageId: result.messageId,
        to,
      }
    },
  },

  /**
   * Enviar mensagem de mídia
   *
   * POST /api/v1/connections/:connectionId/messages/media
   */
  sendMedia: {
    method: 'POST',
    path: '/connections/:connectionId/messages/media',
    schema: {
      body: SendMediaMessageSchema,
    },
    handler: async ({ params, body, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { connectionId } = params as { connectionId: string }
      const { to, mediaType, mediaUrl, caption, filename } = body

      // Verificar ownership
      const connection = await db.connection.findFirst({
        where: {
          id: connectionId,
          organizationId: user.currentOrgId,
          deletedAt: null,
        },
      })

      if (!connection) {
        throw new Error('Connection not found')
      }

      // Rate limiting
      const rateLimitKey = `connection:${connectionId}:messages`
      const rateLimit = await checkRateLimit(rateLimitKey, {
        window: '1m',
        max: 20, // 20 mídias por minuto (mais pesado)
      })

      if (!rateLimit.allowed) {
        throw new Error(
          `Rate limit exceeded. Try again in ${Math.ceil(rateLimit.reset / 1000)}s`
        )
      }

      // Preparar payload baseado no tipo
      let endpoint = '/message/sendMedia'
      const payload: any = {
        number: to,
        mediaUrl,
        mediaType,
      }

      if (caption) payload.caption = caption
      if (filename) payload.fileName = filename

      // Enviar
      const result = await sendViaUazapi(connectionId, endpoint, payload)

      if (!result.success) {
        throw new Error(result.error || 'Failed to send media')
      }

      return {
        success: true,
        messageId: result.messageId,
        to,
        mediaType,
      }
    },
  },

  /**
   * Enviar mensagem com botões
   *
   * POST /api/v1/connections/:connectionId/messages/buttons
   */
  sendButtons: {
    method: 'POST',
    path: '/connections/:connectionId/messages/buttons',
    schema: {
      body: SendButtonsMessageSchema,
    },
    handler: async ({ params, body, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { connectionId } = params as { connectionId: string }
      const { to, text, buttons, footer } = body

      // Verificar ownership
      const connection = await db.connection.findFirst({
        where: {
          id: connectionId,
          organizationId: user.currentOrgId,
          deletedAt: null,
        },
      })

      if (!connection) {
        throw new Error('Connection not found')
      }

      // Rate limiting
      const rateLimitKey = `connection:${connectionId}:messages`
      const rateLimit = await checkRateLimit(rateLimitKey, {
        window: '1m',
        max: 30,
      })

      if (!rateLimit.allowed) {
        throw new Error(
          `Rate limit exceeded. Try again in ${Math.ceil(rateLimit.reset / 1000)}s`
        )
      }

      // Enviar
      const result = await sendViaUazapi(connectionId, '/message/sendButtons', {
        number: to,
        text,
        buttons,
        footer,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to send buttons')
      }

      return {
        success: true,
        messageId: result.messageId,
        to,
        buttonsCount: buttons.length,
      }
    },
  },

  /**
   * Enviar mensagem com lista
   *
   * POST /api/v1/connections/:connectionId/messages/list
   */
  sendList: {
    method: 'POST',
    path: '/connections/:connectionId/messages/list',
    schema: {
      body: SendListMessageSchema,
    },
    handler: async ({ params, body, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { connectionId } = params as { connectionId: string }
      const { to, text, buttonText, sections, footer } = body

      // Verificar ownership
      const connection = await db.connection.findFirst({
        where: {
          id: connectionId,
          organizationId: user.currentOrgId,
          deletedAt: null,
        },
      })

      if (!connection) {
        throw new Error('Connection not found')
      }

      // Rate limiting
      const rateLimitKey = `connection:${connectionId}:messages`
      const rateLimit = await checkRateLimit(rateLimitKey, {
        window: '1m',
        max: 30,
      })

      if (!rateLimit.allowed) {
        throw new Error(
          `Rate limit exceeded. Try again in ${Math.ceil(rateLimit.reset / 1000)}s`
        )
      }

      // Enviar
      const result = await sendViaUazapi(connectionId, '/message/sendList', {
        number: to,
        text,
        buttonText,
        sections,
        footer,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to send list')
      }

      return {
        success: true,
        messageId: result.messageId,
        to,
        sectionsCount: sections.length,
      }
    },
  },

  /**
   * Enviar template (WhatsApp Business)
   *
   * POST /api/v1/connections/:connectionId/messages/template
   */
  sendTemplate: {
    method: 'POST',
    path: '/connections/:connectionId/messages/template',
    schema: {
      body: SendTemplateMessageSchema,
    },
    handler: async ({ params, body, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { connectionId } = params as { connectionId: string }
      const { to, templateName, languageCode, components } = body

      // Verificar ownership
      const connection = await db.connection.findFirst({
        where: {
          id: connectionId,
          organizationId: user.currentOrgId,
          deletedAt: null,
        },
      })

      if (!connection) {
        throw new Error('Connection not found')
      }

      // Templates têm rate limit mais generoso (marketing)
      const rateLimitKey = `connection:${connectionId}:templates`
      const rateLimit = await checkRateLimit(rateLimitKey, {
        window: '1m',
        max: 100, // 100 templates por minuto
      })

      if (!rateLimit.allowed) {
        throw new Error(
          `Rate limit exceeded. Try again in ${Math.ceil(rateLimit.reset / 1000)}s`
        )
      }

      // Enviar
      const result = await sendViaUazapi(connectionId, '/message/sendTemplate', {
        number: to,
        template: {
          name: templateName,
          language: languageCode,
          components,
        },
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to send template')
      }

      return {
        success: true,
        messageId: result.messageId,
        to,
        template: templateName,
      }
    },
  },

  /**
   * Verificar se número está no WhatsApp
   *
   * POST /api/v1/connections/:connectionId/check-number
   */
  checkNumber: {
    method: 'POST',
    path: '/connections/:connectionId/check-number',
    schema: {
      body: z.object({
        number: z.string().min(1),
      }),
    },
    handler: async ({ params, body, context }) => {
      const user = context.user
      if (!user || !user.currentOrgId) {
        throw new Error('Unauthorized')
      }

      const { connectionId } = params as { connectionId: string }
      const { number } = body

      // Verificar ownership
      const connection = await db.connection.findFirst({
        where: {
          id: connectionId,
          organizationId: user.currentOrgId,
          deletedAt: null,
        },
      })

      if (!connection) {
        throw new Error('Connection not found')
      }

      // Verificar
      const result = await sendViaUazapi(connectionId, '/contact/check', {
        number,
      })

      return {
        exists: result.success,
        number,
      }
    },
  }
})
