/**
 * UAZ API Webhooks Controller (Enhanced)
 *
 * Versão aprimorada com integração de transcrição e concatenação
 *
 * Fluxo Completo:
 * 1. Recebe evento do uazapi (webhook global)
 * 2. Identifica conexão (instanceId → connectionId)
 * 3. **TRANSCRIÇÃO**: Se for mídia (áudio/vídeo/imagem), transcreve para texto
 * 4. **CONCATENAÇÃO**: Agrupa mensagens rápidas do mesmo contato
 * 5. Roteia para n8n com payload enriquecido
 * 6. Registra logs completos
 *
 * @module features/webhooks/controllers
 */

import { defineController } from '@igniter-js/core/controller'
import { z } from 'zod'
import { check as checkRateLimit } from '@/lib/rate-limit'
import { db } from '@/services/database'
import { transcriptionEngine } from '@/lib/transcription/transcription.engine'
import { messageConcatenator } from '@/lib/concatenation/message-concatenator.service'
import { publishN8nLog } from '../connections/controllers/connections-realtime.controller'
import type { Prisma } from '@prisma/client'

/**
 * Schema aprimorado para eventos do uazapi
 */
const UazapiEventSchema = z.object({
  instanceId: z.string(),
  event: z.enum(['messages', 'messages_update', 'connection']),
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
    // Campos de mídia
    mediaUrl: z.string().url().optional(),
    mediaType: z.string().optional(),
    mimeType: z.string().optional(),
    caption: z.string().optional(),
  }),
  timestamp: z.number().optional(),
  wasSentByApi: z.boolean().optional(),
})

type UazapiEvent = z.infer<typeof UazapiEventSchema>

/**
 * Processar mensagem com transcrição e concatenação
 */
async function processMessageWithEnrichment(
  event: UazapiEvent,
  connectionId: string,
  organizationId: string
): Promise<{
  enrichedText: string
  transcription?: string
  shouldConcatenate: boolean
}> {
  let enrichedText = ''
  let transcription: string | undefined

  const messageType = event.data.messageType || 'text'
  const mediaUrl = event.data.mediaUrl
  const remoteJid = event.data.key?.remoteJid
  const fromMe = event.data.key?.fromMe || false

  // 1. TRANSCRIÇÃO DE MÍDIA
  if (mediaUrl && !fromMe) {
    // Não transcrever mensagens enviadas por nós
    console.log(`[Webhook] Transcribing ${messageType} from ${mediaUrl}`)

    try {
      switch (messageType) {
        case 'audio':
        case 'voice':
        case 'ptt': {
          const result = await transcriptionEngine.transcribeAudio(mediaUrl)
          transcription = result.text
          enrichedText = `[Áudio transcrito]: ${result.text}`
          break
        }

        case 'video': {
          const result = await transcriptionEngine.transcribeVideo(mediaUrl)
          transcription = result.text
          enrichedText = `[Vídeo transcrito]: ${result.text}`
          break
        }

        case 'image': {
          const result = await transcriptionEngine.describeImage(mediaUrl)
          transcription = result.text
          enrichedText = `[Imagem descrita]: ${result.text}`
          break
        }

        case 'document': {
          const mimeType = event.data.mimeType || 'application/pdf'
          const result = await transcriptionEngine.extractDocumentText(mediaUrl, mimeType)
          transcription = result.text
          enrichedText = `[Documento]: ${result.text}`
          break
        }

        default:
          enrichedText = event.data.message?.conversation || event.data.caption || ''
      }
    } catch (error) {
      console.error('[Webhook] Transcription error:', error)
      enrichedText = `[Erro na transcrição de ${messageType}]`
    }
  } else {
    // Texto simples
    enrichedText = event.data.message?.conversation || event.data.caption || ''
  }

  // 2. CONCATENAÇÃO (apenas para mensagens de entrada de texto)
  const shouldConcatenate =
    !fromMe && // Não concatenar mensagens enviadas por nós
    remoteJid && // Precisa ter remetente
    (messageType === 'text' || !!transcription) && // Texto ou transcrito
    enrichedText.length > 0 // Tem conteúdo

  return {
    enrichedText,
    transcription,
    shouldConcatenate,
  }
}

/**
 * Rotear para n8n com payload enriquecido
 */
async function routeToN8nEnriched(
  connectionId: string,
  event: UazapiEvent,
  enrichedData: {
    enrichedText: string
    transcription?: string
    isConcatenated?: boolean
    messagesCount?: number
  }
): Promise<{ success: boolean; latency: number; error?: string }> {
  const startTime = Date.now()

  try {
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
        latency: Date.now() - startTime,
        error: 'Connection not found',
      }
    }

    const targetUrl = connection.n8nWebhookUrl || connection.n8nFallbackUrl

    if (!targetUrl) {
      console.warn(`[Webhook] Connection ${connectionId} has no n8n URL configured`)
      return {
        success: false,
        latency: Date.now() - startTime,
        error: 'No n8n webhook URL configured',
      }
    }

    // Rate limiting
    const rateLimitKey = `n8n:${connectionId}`
    const rateLimit = await checkRateLimit(rateLimitKey, {
      window: '1m',
      max: 60,
    })

    if (!rateLimit.allowed) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: `Rate limit exceeded`,
      }
    }

    // Payload enriquecido para n8n
    const payload = {
      event: event.event,
      instanceId: event.instanceId,
      connectionId: connection.id,
      connectionName: connection.name,
      organizationId: connection.organizationId,

      // Dados originais
      originalData: event.data,

      // Dados enriquecidos
      enriched: {
        text: enrichedData.enrichedText,
        transcription: enrichedData.transcription,
        isConcatenated: enrichedData.isConcatenated || false,
        messagesCount: enrichedData.messagesCount || 1,
      },

      // Contexto
      contact: {
        phone: event.data.key?.remoteJid?.replace('@s.whatsapp.net', ''),
        name: event.data.pushName,
      },

      timestamp: event.timestamp || Date.now(),
      agentConfig: connection.agentConfig as Prisma.JsonObject | null,
    }

    // Enviar para n8n
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Connection-Id': connectionId,
        'X-Workflow-Id': connection.n8nWorkflowId || '',
        'X-Enriched': 'true', // Flag indicando que payload foi enriquecido
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    })

    const latency = Date.now() - startTime
    const success = response.ok

    // Registrar log
    const logData = {
      connectionId,
      url: targetUrl,
      payload: payload as Prisma.InputJsonValue,
      response: {
        status: response.status,
        statusText: response.statusText,
        enriched: true,
      } as Prisma.InputJsonValue,
      success,
      latency,
    }

    await db.n8nCallLog.create({ data: logData })

    // Publicar log em tempo real
    await publishN8nLog(connectionId, logData)

    return { success, latency }
  } catch (error) {
    const latency = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Webhook] Error routing to n8n:`, error)
    return { success: false, latency, error: errorMessage }
  }
}

/**
 * UAZ API Webhooks Controller (Enhanced)
 */
export const uazapiWebhooksEnhancedController = defineController({
  /**
   * Receber webhook global do uazapi (com transcrição + concatenação)
   *
   * POST /api/v1/webhooks/uazapi-enhanced
   */
  receiveUazapi: {
    method: 'POST',
    path: '/webhooks/uazapi-enhanced',
    public: true,
    schema: {
      body: UazapiEventSchema,
    },
    handler: async ({ body }) => {
      const event = body

      console.log(
        `[Webhook Enhanced] Received event: ${event.event} from instance: ${event.instanceId}`
      )

      try {
        // Buscar conexão
        const connection = await db.connection.findUnique({
          where: { uazapiInstanceId: event.instanceId },
          select: {
            id: true,
            name: true,
            organizationId: true,
            status: true,
          },
        })

        if (!connection) {
          console.warn(`[Webhook Enhanced] Connection not found for instanceId: ${event.instanceId}`)
          return {
            success: false,
            error: 'Connection not found',
            instanceId: event.instanceId,
          }
        }

        // Processar apenas mensagens (não events de conexão)
        if (event.event !== 'messages') {
          console.log(`[Webhook Enhanced] Skipping non-message event: ${event.event}`)
          return {
            success: true,
            skipped: true,
            reason: 'Not a message event',
          }
        }

        // Processar com transcrição
        const enriched = await processMessageWithEnrichment(
          event,
          connection.id,
          connection.organizationId
        )

        // Se deve concatenar, adicionar ao grupo
        if (enriched.shouldConcatenate) {
          const remoteJid = event.data.key!.remoteJid
          const phoneNumber = remoteJid.replace('@s.whatsapp.net', '')

          // Buscar ou criar sessão
          let session = await db.chatSession.findFirst({
            where: {
              instanceId: connection.id,
              contact: { phoneNumber },
            },
            include: { contact: true },
          })

          if (!session) {
            // Criar contato e sessão
            let contact = await db.contact.findFirst({
              where: {
                phoneNumber,
                organizationId: connection.organizationId,
              },
            })

            if (!contact) {
              contact = await db.contact.create({
                data: {
                  phoneNumber,
                  name: event.data.pushName || phoneNumber,
                  organizationId: connection.organizationId,
                },
              })
            }

            session = await db.chatSession.create({
              data: {
                instanceId: connection.id,
                contactId: contact.id,
                organizationId: connection.organizationId,
                status: 'ACTIVE',
              },
              include: { contact: true },
            })
          }

          // Adicionar à concatenação
          const concatResult = await messageConcatenator.addMessage(session.id, session.contactId, {
            instanceId: event.instanceId,
            waMessageId: event.data.key!.id,
            type: event.data.messageType as any,
            content: enriched.enrichedText,
            direction: 'INBOUND',
            mediaUrl: event.data.mediaUrl,
            mediaType: event.data.mediaType,
            mimeType: event.data.mimeType,
          })

          console.log(`[Webhook Enhanced] Message added to concatenation: ${concatResult}`)

          // Não enviar para n8n ainda (será enviado após timeout de concatenação)
          return {
            success: true,
            connectionId: connection.id,
            concatenationStatus: concatResult,
            enrichedText: enriched.enrichedText,
            transcription: enriched.transcription,
          }
        }

        // Enviar direto para n8n (sem concatenação)
        const result = await routeToN8nEnriched(connection.id, event, enriched)

        return {
          success: result.success,
          connectionId: connection.id,
          connectionName: connection.name,
          latency: result.latency,
          enrichedText: enriched.enrichedText,
          transcription: enriched.transcription,
          error: result.error,
        }
      } catch (error) {
        console.error('[Webhook Enhanced] Error processing webhook:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          instanceId: event.instanceId,
        }
      }
    },
  },
})
