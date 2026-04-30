import { igniter } from '@/igniter'
import { z } from 'zod'
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure'
import { database } from '@/server/services/database'

/**
 * @controller MediaController
 * @description Controller para envio de mídia (imagem, vídeo, documentos)
 */

// Schemas de validação
const sendMediaSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: z.string().min(1, 'Chat ID é obrigatório'),
  mediaUrl: z.string().url('URL de mídia inválida').refine((url) => {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;
      const blocked = [/^localhost$/i, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^169\.254\./, /^0\./, /^\[::1\]/, /^fc00:/i, /^fe80:/i];
      return !blocked.some((re) => re.test(hostname));
    } catch { return false; }
  }, { message: 'URL interna bloqueada' }).optional(),
  mediaBase64: z.string().max(22_000_000, 'Base64 excede limite de 16MB').optional(),
  mimeType: z.string().min(1, 'MIME type é obrigatório').refine(
    (mime) => [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/aac',
      'video/mp4', 'video/3gpp',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv',
    ].includes(mime),
    { message: 'MIME type não suportado' }
  ),
  fileName: z.string().optional(),
  caption: z.string().optional(),
})

export const mediaController = igniter.controller({
  name: 'media',
  path: '/messages/media',

  actions: {
    /**
     * @action sendImage
     * @description Envia uma imagem para um chat
     * @route POST /api/v1/messages/media/image
     */
    sendImage: igniter.mutation({
      path: '/image',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: sendMediaSchema,
      handler: async ({ request, response, context }) => {
        try {
          const { instanceId, chatId, mediaUrl, mediaBase64, caption } = request.body

          // Buscar instância
          const instance = await database.connection.findUnique({
            where: { id: instanceId },
            select: { id: true, uazapiToken: true, status: true, organizationId: true }
          })

          if (!instance) {
            return response.notFound('Instância não encontrada')
          }

          // Verificar permissão de organização
          const orgId = context.auth?.session?.user?.currentOrgId
          if (instance.organizationId !== orgId) {
            return response.forbidden('Sem permissão para acessar esta instância')
          }

          if (instance.status !== 'CONNECTED') {
            return response.badRequest('Instância não está conectada')
          }

          if (!instance.uazapiToken) {
            return response.badRequest('Token UAZ não configurado')
          }

          const payload: { chatId: string; caption: string; mediaUrl?: string; media?: string } = {
            chatId,
            caption: caption || ''
          }

          if (mediaUrl) {
            payload.mediaUrl = mediaUrl
          } else if (mediaBase64) {
            payload.media = mediaBase64
          } else {
            return response.badRequest('mediaUrl ou mediaBase64 é obrigatório')
          }

          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          const uazResponse = await fetch(`${UAZAPI_URL}/send/media`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': instance.uazapiToken
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
          })

          const uazData = await uazResponse.json()

          if (!uazResponse.ok) {
            return response.badRequest(uazData.message || 'Erro ao enviar imagem')
          }

          return response.success({
            data: {
              success: true,
              messageId: uazData.messageId || uazData.id,
              message: 'Imagem enviada com sucesso',
            }
          })

        } catch (error: unknown) {
          console.error('Erro ao enviar imagem:', error instanceof Error ? error.message : error)
          throw error
        }
      }
    }),

    /**
     * @action sendDocument
     * @description Envia um documento para um chat
     * @route POST /api/v1/messages/media/document
     */
    sendDocument: igniter.mutation({
      path: '/document',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: sendMediaSchema,
      handler: async ({ request, response, context }) => {
        try {
          const { instanceId, chatId, mediaUrl, mediaBase64, fileName, caption } = request.body

          // Buscar instância
          const instance = await database.connection.findUnique({
            where: { id: instanceId },
            select: { id: true, uazapiToken: true, status: true, organizationId: true }
          })

          if (!instance) {
            return response.notFound('Instância não encontrada')
          }

          // Verificar permissão
          const orgId = context.auth?.session?.user?.currentOrgId
          if (instance.organizationId !== orgId) {
            return response.forbidden('Sem permissão para acessar esta instância')
          }

          if (instance.status !== 'CONNECTED') {
            return response.badRequest('Instância não está conectada')
          }

          if (!instance.uazapiToken) {
            return response.badRequest('Token UAZ não configurado')
          }

          const payload: { chatId: string; caption: string; fileName: string; mediaUrl?: string; media?: string } = {
            chatId,
            caption: caption || '',
            fileName: fileName || 'document.pdf'
          }

          if (mediaUrl) {
            payload.mediaUrl = mediaUrl
          } else if (mediaBase64) {
            payload.media = mediaBase64
          } else {
            return response.badRequest('mediaUrl ou mediaBase64 é obrigatório')
          }

          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          const uazResponse = await fetch(`${UAZAPI_URL}/send/media`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': instance.uazapiToken
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
          })

          const uazData = await uazResponse.json()

          if (!uazResponse.ok) {
            return response.badRequest(uazData.message || 'Erro ao enviar documento')
          }

          return response.success({
            data: {
              success: true,
              messageId: uazData.messageId || uazData.id,
              message: 'Documento enviado com sucesso',
            }
          })

        } catch (error: unknown) {
          console.error('Erro ao enviar documento:', error instanceof Error ? error.message : error)
          throw error
        }
      }
    }),

    /**
     * @action sendAudio
     * @description Envia um áudio para um chat
     * @route POST /api/v1/messages/media/audio
     */
    sendAudio: igniter.mutation({
      path: '/audio',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: z.object({
        instanceId: z.string().min(1, 'Instance ID é obrigatório'),
        chatId: z.string().min(1, 'Chat ID é obrigatório'),
        mediaBase64: z.string().max(22_000_000, 'Base64 excede limite de 16MB'),
        mimeType: z.string().refine(
          (mime) => ['audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/aac', 'audio/webm'].includes(mime),
          { message: 'MIME type de áudio não suportado' }
        ),
        duration: z.number().optional(),
        sessionId: z.string().optional(),
      }),
      handler: async ({ request, response, context }) => {
        try {
          const { instanceId, chatId, mediaBase64, mimeType, duration } = request.body

          const orgId = context.auth?.session?.user?.currentOrgId
          if (!orgId) {
            return response.unauthorized('Organização não identificada')
          }

          const instance = await database.connection.findFirst({
            where: { id: instanceId, organizationId: orgId },
            select: { id: true, uazapiToken: true, status: true, organizationId: true }
          })

          if (!instance) {
            return response.notFound('Instância não encontrada')
          }

          if (instance.status !== 'CONNECTED') {
            return response.badRequest('Instância não está conectada')
          }

          if (!instance.uazapiToken) {
            return response.badRequest('Token UAZ não configurado')
          }

          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          const uazResponse = await fetch(`${UAZAPI_URL}/send/audio`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': instance.uazapiToken
            },
            body: JSON.stringify({
              chatId,
              media: mediaBase64,
              mimeType,
              duration: duration || 0,
            }),
            signal: AbortSignal.timeout(15000),
          })

          const uazData = await uazResponse.json()

          if (!uazResponse.ok) {
            return response.badRequest(uazData.message || 'Erro ao enviar áudio')
          }

          return response.success({
            data: {
              success: true,
              messageId: uazData.messageId || uazData.id,
              message: 'Áudio enviado com sucesso',
            }
          })

        } catch (error: unknown) {
          console.error('Erro ao enviar áudio:', error instanceof Error ? error.message : error)
          throw error
        }
      }
    }),
  }
})
