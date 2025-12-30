import { igniter } from '@/igniter'
import { z } from 'zod'
import { authProcedure } from '@/features/auth/procedures/auth.procedure'
import { database } from '@/services/database'
import { ConnectionStatus } from '@prisma/client'

/**
 * @controller MediaController
 * @description Controller para envio de mídia (imagem, vídeo, documentos)
 */

// Schemas de validação
const sendMediaSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: z.string().min(1, 'Chat ID é obrigatório'),
  mediaUrl: z.string().url('URL de mídia inválida').optional(),
  mediaBase64: z.string().optional(),
  mimeType: z.string().min(1, 'MIME type é obrigatório'),
  fileName: z.string().optional(),
  caption: z.string().optional(),
})

const sendAudioSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: z.string().min(1, 'Chat ID é obrigatório'),
  mediaBase64: z.string().min(1, 'Audio base64 é obrigatório'),
  mimeType: z.string().min(1, 'MIME type é obrigatório'),
  duration: z.number().optional(), // Duration in seconds
})

export const mediaController = igniter.controller({
  name: 'media',
  path: '/messages/media',

  actions: {
    /**
     * @action sendImage
     * @description Envia uma imagem para um chat
     * @route POST /api/v1/messages/media/image
     *
     * FORMATO UAZapi DESCOBERTO:
     * - Usar 'type: image' (não 'mediatype')
     * - Usar 'file' (não 'media')
     * - Usar 'number' (não 'chatId')
     */
    sendImage: igniter.mutation({
      path: '/image',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: sendMediaSchema,
      handler: async ({ request, response, context }) => {
        try {
          const { instanceId, chatId, mediaUrl, mediaBase64, mimeType, caption } = request.body

          // Buscar conexão (instância WhatsApp)
          const connection = await database.connection.findUnique({
            where: { id: instanceId },
            select: { id: true, uazapiToken: true, status: true, organizationId: true }
          })

          if (!connection) {
            return response.notFound('Conexão não encontrada')
          }

          // Verificar permissão de organização
          const orgId = context.auth?.session?.user?.currentOrgId
          if (connection.organizationId !== orgId) {
            return response.forbidden('Sem permissão para acessar esta conexão')
          }

          if (connection.status !== ConnectionStatus.CONNECTED) {
            return response.badRequest('Conexão não está conectada')
          }

          if (!connection.uazapiToken) {
            return response.badRequest('Token UAZ não configurado')
          }

          // Extrair número do chatId (remover @s.whatsapp.net ou @g.us)
          const number = chatId.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '')

          // Preparar payload no formato correto para UAZapi
          // FORMATO: { number, type: 'image', file: 'data:mime;base64,...' }
          const payload: Record<string, any> = {
            number,
            type: 'image',
          }

          // Adicionar arquivo como data URI
          if (mediaUrl) {
            payload.file = mediaUrl
          } else if (mediaBase64) {
            // Garantir que está no formato data URI
            const dataUri = mediaBase64.startsWith('data:')
              ? mediaBase64
              : `data:${mimeType || 'image/jpeg'};base64,${mediaBase64}`
            payload.file = dataUri
          } else {
            return response.badRequest('mediaUrl ou mediaBase64 é obrigatório')
          }

          // Adicionar caption se fornecido
          if (caption) {
            payload.caption = caption
          }

          // Enviar para UAZapi
          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          console.log('[MediaController] Sending image to UAZapi:', {
            endpoint: `${UAZAPI_URL}/send/media`,
            number,
            type: 'image',
            hasCaption: !!caption
          })

          const uazResponse = await fetch(`${UAZAPI_URL}/send/media`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': connection.uazapiToken
            },
            body: JSON.stringify(payload)
          })

          const uazData = await uazResponse.json()

          if (!uazResponse.ok) {
            console.error('[MediaController] UAZapi image error:', {
              status: uazResponse.status,
              data: uazData
            })
            return response.badRequest(uazData.error || uazData.message || 'Erro ao enviar imagem')
          }

          return response.success({
            data: {
              success: true,
              messageId: uazData.messageid || uazData.messageId || uazData.id,
              messageType: uazData.messageType,
              message: 'Imagem enviada com sucesso',
              ...uazData
            }
          })

        } catch (error: any) {
          console.error('Erro ao enviar imagem:', error)
          return response.badRequest(error.message || 'Erro ao enviar imagem')
        }
      }
    }),

    /**
     * @action sendDocument
     * @description Envia um documento para um chat
     * @route POST /api/v1/messages/media/document
     *
     * FORMATO UAZapi DESCOBERTO:
     * - Usar 'type: document'
     * - Usar 'file' (não 'media')
     * - Usar 'number' (não 'chatId')
     * - Incluir 'filename' obrigatoriamente
     */
    sendDocument: igniter.mutation({
      path: '/document',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: sendMediaSchema,
      handler: async ({ request, response, context }) => {
        try {
          const { instanceId, chatId, mediaUrl, mediaBase64, mimeType, fileName, caption } = request.body

          // Buscar conexão (instância WhatsApp)
          const connection = await database.connection.findUnique({
            where: { id: instanceId },
            select: { id: true, uazapiToken: true, status: true, organizationId: true }
          })

          if (!connection) {
            return response.notFound('Conexão não encontrada')
          }

          // Verificar permissão
          const orgId = context.auth?.session?.user?.currentOrgId
          if (connection.organizationId !== orgId) {
            return response.forbidden('Sem permissão para acessar esta conexão')
          }

          if (connection.status !== ConnectionStatus.CONNECTED) {
            return response.badRequest('Conexão não está conectada')
          }

          if (!connection.uazapiToken) {
            return response.badRequest('Token UAZ não configurado')
          }

          // Extrair número do chatId
          const number = chatId.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '')

          // Preparar payload no formato correto para UAZapi
          // FORMATO: { number, type: 'document', file: '...', filename: 'name.ext' }
          const payload: Record<string, any> = {
            number,
            type: 'document',
            filename: fileName || 'document.pdf',
          }

          // Adicionar arquivo
          if (mediaUrl) {
            payload.file = mediaUrl
          } else if (mediaBase64) {
            const dataUri = mediaBase64.startsWith('data:')
              ? mediaBase64
              : `data:${mimeType || 'application/octet-stream'};base64,${mediaBase64}`
            payload.file = dataUri
          } else {
            return response.badRequest('mediaUrl ou mediaBase64 é obrigatório')
          }

          // Adicionar caption se fornecido
          if (caption) {
            payload.caption = caption
          }

          // Enviar para UAZapi
          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          console.log('[MediaController] Sending document to UAZapi:', {
            endpoint: `${UAZAPI_URL}/send/media`,
            number,
            type: 'document',
            filename: payload.filename
          })

          const uazResponse = await fetch(`${UAZAPI_URL}/send/media`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': connection.uazapiToken
            },
            body: JSON.stringify(payload)
          })

          const uazData = await uazResponse.json()

          if (!uazResponse.ok) {
            console.error('[MediaController] UAZapi document error:', {
              status: uazResponse.status,
              data: uazData
            })
            return response.badRequest(uazData.error || uazData.message || 'Erro ao enviar documento')
          }

          return response.success({
            data: {
              success: true,
              messageId: uazData.messageid || uazData.messageId || uazData.id,
              messageType: uazData.messageType,
              message: 'Documento enviado com sucesso',
              ...uazData
            }
          })

        } catch (error: any) {
          console.error('Erro ao enviar documento:', error)
          return response.badRequest(error.message || 'Erro ao enviar documento')
        }
      }
    }),

    /**
     * @action sendAudio
     * @description Envia um audio para um chat (voice message / PTT)
     * @route POST /api/v1/messages/media/audio
     *
     * FORMATO UAZapi DESCOBERTO:
     * - Usar 'type: ptt' para mensagem de voz (push-to-talk)
     * - Usar 'type: audio' para arquivo de áudio normal
     * - Usar 'file' (não 'media')
     * - Usar 'number' (não 'chatId')
     */
    sendAudio: igniter.mutation({
      path: '/audio',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: sendAudioSchema,
      handler: async ({ request, response, context }) => {
        try {
          const { instanceId, chatId, mediaBase64, mimeType } = request.body

          // Buscar conexão (instância WhatsApp)
          const connection = await database.connection.findUnique({
            where: { id: instanceId },
            select: { id: true, uazapiToken: true, status: true, organizationId: true }
          })

          if (!connection) {
            return response.notFound('Conexão não encontrada')
          }

          // Verificar permissão de organização
          const user = context.auth?.session?.user
          const isAdmin = user?.role === 'admin'
          const orgId = user?.currentOrgId

          if (!isAdmin && connection.organizationId !== orgId) {
            return response.forbidden('Sem permissão para acessar esta conexão')
          }

          if (connection.status !== ConnectionStatus.CONNECTED) {
            return response.badRequest('Conexão não está conectada')
          }

          if (!connection.uazapiToken) {
            return response.badRequest('Token UAZ não configurado')
          }

          // Extrair número do chatId
          const number = chatId.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '')

          // Preparar payload no formato correto para UAZapi
          // FORMATO: { number, type: 'ptt', file: 'data:audio/...;base64,...' }
          // Usar 'ptt' para mensagem de voz (push-to-talk) no WhatsApp
          const dataUri = mediaBase64.startsWith('data:')
            ? mediaBase64
            : `data:${mimeType};base64,${mediaBase64}`

          const payload = {
            number,
            type: 'ptt', // Push-to-talk = mensagem de voz do WhatsApp
            file: dataUri,
          }

          // Enviar para UAZapi
          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          console.log('[MediaController] Sending audio to UAZapi:', {
            endpoint: `${UAZAPI_URL}/send/media`,
            number,
            type: 'ptt',
            mimeType,
            mediaLength: mediaBase64.length
          })

          const uazResponse = await fetch(`${UAZAPI_URL}/send/media`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': connection.uazapiToken
            },
            body: JSON.stringify(payload)
          })

          const uazData = await uazResponse.json()

          if (!uazResponse.ok) {
            console.error('[MediaController] UAZapi audio error:', {
              status: uazResponse.status,
              data: uazData
            })
            return response.badRequest(uazData.error || uazData.message || 'Erro ao enviar audio')
          }

          return response.success({
            data: {
              success: true,
              messageId: uazData.messageid || uazData.messageId || uazData.id || uazData.key?.id,
              messageType: uazData.messageType,
              message: 'Audio enviado com sucesso',
              ...uazData
            }
          })

        } catch (error: any) {
          console.error('Erro ao enviar audio:', error)
          return response.badRequest(error.message || 'Erro ao enviar audio')
        }
      }
    }),
  }
})
