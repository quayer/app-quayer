import { igniter } from '@/igniter'
import { z } from 'zod'
import { authProcedure } from '@/features/auth/procedures/auth.procedure'
import { database } from '@/services/database'

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
      input: sendMediaSchema,
      handler: async ({ request, response, context, input }) => {
        try {
          const { instanceId, chatId, mediaUrl, mediaBase64, caption } = input

          // Buscar instância
          const instance = await database.instance.findUnique({
            where: { id: instanceId },
            select: { id: true, uazToken: true, status: true, organizationId: true }
          })

          if (!instance) {
            return response.error({
              message: 'Instância não encontrada',
              status: 404
            })
          }

          // Verificar permissão de organização
          const orgId = context.auth?.session?.currentOrgId
          if (instance.organizationId !== orgId) {
            return response.error({
              message: 'Sem permissão para acessar esta instância',
              status: 403
            })
          }

          if (instance.status !== 'connected') {
            return response.error({
              message: 'Instância não está conectada',
              status: 400
            })
          }

          if (!instance.uazToken) {
            return response.error({
              message: 'Token UAZ não configurado',
              status: 400
            })
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
            return response.error({
              message: 'mediaUrl ou mediaBase64 é obrigatório',
              status: 400
            })
          }

          // Enviar para UAZapi
          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          const uazResponse = await fetch(`${UAZAPI_URL}/send/media`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': instance.uazToken
            },
            body: JSON.stringify(payload)
          })

          const uazData = await uazResponse.json()

          if (!uazResponse.ok) {
            return response.error({
              message: uazData.message || 'Erro ao enviar imagem',
              status: uazResponse.status
            })
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
          return response.error({
            message: error.message || 'Erro ao enviar imagem',
            status: 500
          })
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
      input: sendMediaSchema,
      handler: async ({ request, response, context, input }) => {
        try {
          const { instanceId, chatId, mediaUrl, mediaBase64, fileName, caption } = input

          // Buscar instância
          const instance = await database.instance.findUnique({
            where: { id: instanceId },
            select: { id: true, uazToken: true, status: true, organizationId: true }
          })

          if (!instance) {
            return response.error({
              message: 'Instância não encontrada',
              status: 404
            })
          }

          // Verificar permissão
          const orgId = context.auth?.session?.currentOrgId
          if (instance.organizationId !== orgId) {
            return response.error({
              message: 'Sem permissão para acessar esta instância',
              status: 403
            })
          }

          if (instance.status !== 'connected') {
            return response.error({
              message: 'Instância não está conectada',
              status: 400
            })
          }

          if (!instance.uazToken) {
            return response.error({
              message: 'Token UAZ não configurado',
              status: 400
            })
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
            return response.error({
              message: 'mediaUrl ou mediaBase64 é obrigatório',
              status: 400
            })
          }

          // Enviar para UAZapi
          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          const uazResponse = await fetch(`${UAZAPI_URL}/send/media`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': instance.uazToken
            },
            body: JSON.stringify(payload)
          })

          const uazData = await uazResponse.json()

          if (!uazResponse.ok) {
            return response.error({
              message: uazData.message || 'Erro ao enviar documento',
              status: uazResponse.status
            })
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
          return response.error({
            message: error.message || 'Erro ao enviar documento',
            status: 500
          })
        }
      }
    }),
  }
})
