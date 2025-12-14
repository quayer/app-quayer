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
          const instance = await database.instance.findUnique({
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

          if (instance.status !== ConnectionStatus.CONNECTED) {
            return response.badRequest('Instância não está conectada')
          }

          if (!instance.uazapiToken) {
            return response.badRequest('Token UAZ não configurado')
          }

          // Preparar payload para UAZapi
          const payload: any = {
            chatId,
            caption: caption || ''
          }

          // Se tiver URL, usar URL, senão usar base64
          if (mediaUrl) {
            payload.mediaUrl = mediaUrl
          } else if (mediaBase64) {
            payload.media = mediaBase64
          } else {
            return response.badRequest('mediaUrl ou mediaBase64 é obrigatório')
          }

          // Enviar para UAZapi
          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          const uazResponse = await fetch(`${UAZAPI_URL}/send/media`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': instance.uazapiToken
            },
            body: JSON.stringify(payload)
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
          const instance = await database.instance.findUnique({
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

          if (instance.status !== ConnectionStatus.CONNECTED) {
            return response.badRequest('Instância não está conectada')
          }

          if (!instance.uazapiToken) {
            return response.badRequest('Token UAZ não configurado')
          }

          // Preparar payload
          const payload: any = {
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

          // Enviar para UAZapi
          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          const uazResponse = await fetch(`${UAZAPI_URL}/send/media`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': instance.uazapiToken
            },
            body: JSON.stringify(payload)
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
              ...uazData
            }
          })

        } catch (error: any) {
          console.error('Erro ao enviar documento:', error)
          return response.badRequest(error.message || 'Erro ao enviar documento')
        }
      }
    }),
  }
})
