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
  sessionId: z.string().uuid().optional(), // ⭐ CRITICAL: Use existing session to ensure message appears in correct chat
})

const sendAudioSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: z.string().min(1, 'Chat ID é obrigatório'),
  mediaBase64: z.string().min(1, 'Audio base64 é obrigatório'),
  mimeType: z.string().min(1, 'MIME type é obrigatório'),
  duration: z.number().optional(), // Duration in seconds
  sessionId: z.string().uuid().optional(), // ⭐ CRITICAL: Use existing session to ensure message appears in correct chat
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
          const { instanceId, chatId, mediaUrl, mediaBase64, mimeType, caption, sessionId: providedSessionId } = request.body

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

          // Extrair número do chatId (remover @s.whatsapp.net ou @g.us)
          const phoneNumber = chatId.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '')

          // Preparar data URI da imagem
          let dataUri: string
          if (mediaBase64) {
            dataUri = mediaBase64.startsWith('data:')
              ? mediaBase64
              : `data:${mimeType || 'image/jpeg'};base64,${mediaBase64}`
          } else if (mediaUrl) {
            dataUri = mediaUrl
          } else {
            return response.badRequest('mediaUrl ou mediaBase64 é obrigatório')
          }

          // ========== BUSCAR/CRIAR SESSÃO E CONTATO ==========
          let session: any
          let contact: any

          // ⭐ CRITICAL FIX: Se sessionId foi fornecido, usar essa sessão diretamente
          if (providedSessionId) {
            session = await database.chatSession.findUnique({
              where: { id: providedSessionId },
              include: { contact: true }
            })

            if (!session) {
              return response.notFound('Sessão não encontrada')
            }

            if (session.connectionId !== instanceId) {
              return response.badRequest('Sessão não pertence a esta conexão')
            }

            contact = session.contact
            console.log(`[MediaController] Using provided session for image: ${session.id}`)
          } else {
            // Fallback: buscar/criar contato e sessão
            contact = await database.contact.findUnique({
              where: { phoneNumber: chatId }
            })

            if (!contact) {
              contact = await database.contact.findUnique({
                where: { phoneNumber }
              })
            }

            if (!contact) {
              contact = await database.contact.create({
                data: {
                  phoneNumber: chatId.includes('@') ? chatId : phoneNumber,
                  name: phoneNumber,
                }
              })
              console.log(`[MediaController] Created new contact: ${contact.id}`)
            }

            session = await database.chatSession.findFirst({
              where: {
                contactId: contact.id,
                connectionId: instanceId,
                status: { not: 'CLOSED' }
              },
              orderBy: { createdAt: 'desc' }
            })

            if (!session) {
              session = await database.chatSession.create({
                data: {
                  contactId: contact.id,
                  connectionId: instanceId,
                  organizationId: connection.organizationId!,
                  status: 'ACTIVE',
                }
              })
              console.log(`[MediaController] Created new session: ${session.id}`)
            }
          }

          // 3. Salvar mensagem de imagem no banco
          const savedMessage = await database.message.create({
            data: {
              sessionId: session.id,
              contactId: contact.id,
              connectionId: instanceId,
              waMessageId: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              direction: 'OUTBOUND',
              type: 'image',
              content: caption || '📷 Imagem',
              mediaUrl: dataUri,
              mediaType: 'image',
              mimeType: mimeType || 'image/jpeg',
              status: 'pending',
              author: 'AGENT',
            }
          })

          console.log(`[MediaController] Image message saved: ${savedMessage.id}`)

          // ========== ENVIAR PARA UAZAPI ==========
          const payload = {
            number: phoneNumber,
            type: 'image',
            file: dataUri,
            ...(caption && { caption }),
          }

          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          console.log('[MediaController] Sending image to UAZapi:', {
            endpoint: `${UAZAPI_URL}/send/media`,
            number: phoneNumber,
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
            await database.message.update({
              where: { id: savedMessage.id },
              data: { status: 'failed' }
            })
            return response.badRequest(uazData.error || uazData.message || 'Erro ao enviar imagem')
          }

          // Atualizar waMessageId
          const waMessageId = uazData.messageid || uazData.messageId || uazData.id || uazData.key?.id
          if (waMessageId) {
            await database.message.update({
              where: { id: savedMessage.id },
              data: { waMessageId, status: 'sent' }
            })
          }

          return response.success({
            data: {
              success: true,
              messageId: savedMessage.id,
              waMessageId,
              messageType: 'image',
              message: 'Imagem enviada com sucesso',
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
          const { instanceId, chatId, mediaUrl, mediaBase64, mimeType, fileName, caption, sessionId: providedSessionId } = request.body

          // Buscar conexão (instância WhatsApp)
          const connection = await database.connection.findUnique({
            where: { id: instanceId },
            select: { id: true, uazapiToken: true, status: true, organizationId: true }
          })

          if (!connection) {
            return response.notFound('Conexão não encontrada')
          }

          // Verificar permissão
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
          const phoneNumber = chatId.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '')
          const docFileName = fileName || 'document.pdf'

          // Preparar data URI do documento
          let dataUri: string
          if (mediaBase64) {
            dataUri = mediaBase64.startsWith('data:')
              ? mediaBase64
              : `data:${mimeType || 'application/pdf'};base64,${mediaBase64}`
          } else if (mediaUrl) {
            dataUri = mediaUrl
          } else {
            return response.badRequest('mediaUrl ou mediaBase64 é obrigatório')
          }

          // ========== BUSCAR/CRIAR SESSÃO E CONTATO ==========
          let session: any
          let contact: any

          // ⭐ CRITICAL FIX: Se sessionId foi fornecido, usar essa sessão diretamente
          if (providedSessionId) {
            session = await database.chatSession.findUnique({
              where: { id: providedSessionId },
              include: { contact: true }
            })

            if (!session) {
              return response.notFound('Sessão não encontrada')
            }

            if (session.connectionId !== instanceId) {
              return response.badRequest('Sessão não pertence a esta conexão')
            }

            contact = session.contact
            console.log(`[MediaController] Using provided session for document: ${session.id}`)
          } else {
            // Fallback: buscar/criar contato e sessão
            contact = await database.contact.findUnique({
              where: { phoneNumber: chatId }
            })

            if (!contact) {
              contact = await database.contact.findUnique({
                where: { phoneNumber }
              })
            }

            if (!contact) {
              contact = await database.contact.create({
                data: {
                  phoneNumber: chatId.includes('@') ? chatId : phoneNumber,
                  name: phoneNumber,
                }
              })
              console.log(`[MediaController] Created new contact: ${contact.id}`)
            }

            // Buscar ou criar sessão
            session = await database.chatSession.findFirst({
              where: {
                contactId: contact.id,
                connectionId: instanceId,
                status: { not: 'CLOSED' }
              },
              orderBy: { createdAt: 'desc' }
            })

            if (!session) {
              session = await database.chatSession.create({
                data: {
                  contactId: contact.id,
                  connectionId: instanceId,
                  organizationId: connection.organizationId!,
                  status: 'ACTIVE',
                }
              })
              console.log(`[MediaController] Created new session: ${session.id}`)
            }
          }

          // 3. Salvar mensagem de documento no banco
          const savedMessage = await database.message.create({
            data: {
              sessionId: session.id,
              contactId: contact.id,
              connectionId: instanceId,
              waMessageId: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              direction: 'OUTBOUND',
              type: 'document',
              content: caption || `📄 ${docFileName}`,
              mediaUrl: dataUri,
              mediaType: 'document',
              mimeType: mimeType || 'application/pdf',
              fileName: docFileName,
              status: 'pending',
              author: 'AGENT',
            }
          })

          console.log(`[MediaController] Document message saved: ${savedMessage.id}`)

          // ========== ENVIAR PARA UAZAPI ==========
          const payload = {
            number: phoneNumber,
            type: 'document',
            file: dataUri,
            filename: docFileName,
            ...(caption && { caption }),
          }

          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          console.log('[MediaController] Sending document to UAZapi:', {
            endpoint: `${UAZAPI_URL}/send/media`,
            number: phoneNumber,
            type: 'document',
            filename: docFileName
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
            await database.message.update({
              where: { id: savedMessage.id },
              data: { status: 'failed' }
            })
            return response.badRequest(uazData.error || uazData.message || 'Erro ao enviar documento')
          }

          // Atualizar waMessageId
          const waMessageId = uazData.messageid || uazData.messageId || uazData.id || uazData.key?.id
          if (waMessageId) {
            await database.message.update({
              where: { id: savedMessage.id },
              data: { waMessageId, status: 'sent' }
            })
          }

          return response.success({
            data: {
              success: true,
              messageId: savedMessage.id,
              waMessageId,
              messageType: 'document',
              message: 'Documento enviado com sucesso',
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
          const { instanceId, chatId, mediaBase64, mimeType, duration, sessionId: providedSessionId } = request.body

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

          // Extrair número do chatId (pode ter @s.whatsapp.net ou @g.us)
          const phoneNumber = chatId.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '')

          // Preparar data URI do áudio para salvar e enviar
          const dataUri = mediaBase64.startsWith('data:')
            ? mediaBase64
            : `data:${mimeType};base64,${mediaBase64}`

          // ========== BUSCAR/CRIAR SESSÃO E CONTATO ==========
          let session: any
          let contact: any

          // ⭐ CRITICAL FIX: Se sessionId foi fornecido, usar essa sessão diretamente
          // Isso garante que o áudio aparece no chat correto no frontend
          if (providedSessionId) {
            session = await database.chatSession.findUnique({
              where: { id: providedSessionId },
              include: { contact: true }
            })

            if (!session) {
              return response.notFound('Sessão não encontrada')
            }

            // Verificar se sessão pertence à mesma conexão/org
            if (session.connectionId !== instanceId) {
              return response.badRequest('Sessão não pertence a esta conexão')
            }

            contact = session.contact
            console.log(`[MediaController] Using provided session: ${session.id}`)
          } else {
            // Fallback: buscar/criar contato e sessão (comportamento antigo)
            contact = await database.contact.findUnique({
              where: { phoneNumber: chatId }
            })

            if (!contact) {
              contact = await database.contact.findUnique({
                where: { phoneNumber }
              })
            }

            if (!contact) {
              contact = await database.contact.create({
                data: {
                  phoneNumber: chatId.includes('@') ? chatId : phoneNumber,
                  name: phoneNumber,
                }
              })
              console.log(`[MediaController] Created new contact: ${contact.id}`)
            }

            // Buscar sessão ativa para este contato/conexão
            session = await database.chatSession.findFirst({
              where: {
                contactId: contact.id,
                connectionId: instanceId,
                status: { not: 'CLOSED' }
              },
              orderBy: { createdAt: 'desc' }
            })

            if (!session) {
              session = await database.chatSession.create({
                data: {
                  contactId: contact.id,
                  connectionId: instanceId,
                  organizationId: connection.organizationId!,
                  status: 'ACTIVE',
                }
              })
              console.log(`[MediaController] Created new session: ${session.id}`)
            }
          }

          // 3. Criar mensagem de áudio no banco COM o mediaUrl (data URI)
          // ⚠️ CRITICAL: Use 'voice' (not 'ptt') - that's the correct enum value
          const savedMessage = await database.message.create({
            data: {
              sessionId: session.id,
              contactId: contact.id,
              connectionId: instanceId,
              waMessageId: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Será atualizado pelo webhook
              direction: 'OUTBOUND',
              type: 'voice', // Push-to-talk / Voice message (correct enum value)
              content: '🎵 Áudio',
              mediaUrl: dataUri, // ⭐ SALVA O ÁUDIO COMO DATA URI
              mediaType: 'audio',
              mimeType: mimeType,
              mediaDuration: duration,
              status: 'pending',
              author: 'AGENT',
            }
          })

          console.log(`[MediaController] Audio message saved: ${savedMessage.id} (mediaUrl: ${dataUri.substring(0, 50)}...)`)

          // ========== ENVIAR PARA UAZAPI ==========
          const payload = {
            number: phoneNumber,
            type: 'ptt',
            file: dataUri,
          }

          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          console.log('[MediaController] Sending audio to UAZapi:', {
            endpoint: `${UAZAPI_URL}/send/media`,
            number: phoneNumber,
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
            // Marcar mensagem como falha
            await database.message.update({
              where: { id: savedMessage.id },
              data: { status: 'failed' }
            })
            return response.badRequest(uazData.error || uazData.message || 'Erro ao enviar audio')
          }

          // Atualizar mensagem com o waMessageId real da UAZapi
          const waMessageId = uazData.messageid || uazData.messageId || uazData.id || uazData.key?.id
          if (waMessageId) {
            await database.message.update({
              where: { id: savedMessage.id },
              data: {
                waMessageId,
                status: 'sent'
              }
            })
          }

          return response.success({
            data: {
              success: true,
              messageId: savedMessage.id,
              waMessageId,
              messageType: 'ptt',
              message: 'Audio enviado com sucesso',
            }
          })

        } catch (error: any) {
          console.error('Erro ao enviar audio:', error)
          return response.badRequest(error.message || 'Erro ao enviar audio')
        }
      }
    }),

    /**
     * @action sendVideo
     * @description Envia um vídeo para um chat
     * @route POST /api/v1/messages/media/video
     *
     * FORMATO UAZapi:
     * - Usar 'type: video'
     * - Usar 'file' (data URI ou URL)
     * - Usar 'number' (não 'chatId')
     */
    sendVideo: igniter.mutation({
      path: '/video',
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
          const phoneNumber = chatId.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '')

          // Preparar data URI do vídeo
          let dataUri: string
          if (mediaBase64) {
            dataUri = mediaBase64.startsWith('data:')
              ? mediaBase64
              : `data:${mimeType || 'video/mp4'};base64,${mediaBase64}`
          } else if (mediaUrl) {
            dataUri = mediaUrl
          } else {
            return response.badRequest('mediaUrl ou mediaBase64 é obrigatório')
          }

          // ========== SALVAR MENSAGEM NO BANCO ==========
          // 1. Buscar ou criar contato
          let contact = await database.contact.findUnique({
            where: { phoneNumber: chatId }
          })

          if (!contact) {
            contact = await database.contact.findUnique({
              where: { phoneNumber }
            })
          }

          if (!contact) {
            contact = await database.contact.create({
              data: {
                phoneNumber: chatId.includes('@') ? chatId : phoneNumber,
                name: phoneNumber,
              }
            })
            console.log(`[MediaController] Created new contact: ${contact.id}`)
          }

          // 2. Buscar ou criar sessão
          let session = await database.chatSession.findFirst({
            where: {
              contactId: contact.id,
              connectionId: instanceId,
              status: { not: 'CLOSED' }
            },
            orderBy: { createdAt: 'desc' }
          })

          if (!session) {
            session = await database.chatSession.create({
              data: {
                contactId: contact.id,
                connectionId: instanceId,
                organizationId: connection.organizationId!,
                status: 'ACTIVE',
              }
            })
            console.log(`[MediaController] Created new session: ${session.id}`)
          }

          // 3. Salvar mensagem de vídeo no banco
          const savedMessage = await database.message.create({
            data: {
              sessionId: session.id,
              contactId: contact.id,
              connectionId: instanceId,
              waMessageId: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              direction: 'OUTBOUND',
              type: 'video',
              content: caption || '🎬 Vídeo',
              mediaUrl: dataUri,
              mediaType: 'video',
              mimeType: mimeType || 'video/mp4',
              status: 'pending',
              author: 'AGENT',
            }
          })

          console.log(`[MediaController] Video message saved: ${savedMessage.id}`)

          // ========== ENVIAR PARA UAZAPI ==========
          const payload = {
            number: phoneNumber,
            type: 'video',
            file: dataUri,
            ...(caption && { caption }),
          }

          const UAZAPI_URL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'

          console.log('[MediaController] Sending video to UAZapi:', {
            endpoint: `${UAZAPI_URL}/send/media`,
            number: phoneNumber,
            type: 'video',
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
            console.error('[MediaController] UAZapi video error:', {
              status: uazResponse.status,
              data: uazData
            })
            await database.message.update({
              where: { id: savedMessage.id },
              data: { status: 'failed' }
            })
            return response.badRequest(uazData.error || uazData.message || 'Erro ao enviar vídeo')
          }

          // Atualizar waMessageId
          const waMessageId = uazData.messageid || uazData.messageId || uazData.id || uazData.key?.id
          if (waMessageId) {
            await database.message.update({
              where: { id: savedMessage.id },
              data: { waMessageId, status: 'sent' }
            })
          }

          return response.success({
            data: {
              success: true,
              messageId: savedMessage.id,
              waMessageId,
              messageType: 'video',
              message: 'Vídeo enviado com sucesso',
            }
          })

        } catch (error: any) {
          console.error('Erro ao enviar video:', error)
          return response.badRequest(error.message || 'Erro ao enviar vídeo')
        }
      }
    }),

    /**
     * @action transcribeAudio
     * @description Transcreve um áudio usando IA (OpenAI Whisper)
     * @route POST /api/v1/messages/media/transcribe/:messageId
     */
    transcribeAudio: igniter.mutation({
      path: '/transcribe/:messageId',
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        try {
          const messageId = (request as any).params?.messageId

          if (!messageId) {
            return response.badRequest('messageId é obrigatório')
          }

          // Buscar mensagem
          const message = await database.message.findUnique({
            where: { id: messageId },
            include: {
              session: {
                include: {
                  connection: { select: { organizationId: true } }
                }
              }
            }
          })

          if (!message) {
            return response.notFound('Mensagem não encontrada')
          }

          // Verificar permissão
          const user = context.auth?.session?.user
          const isAdmin = user?.role === 'admin'
          const orgId = user?.currentOrgId

          if (!isAdmin && message.session?.connection?.organizationId !== orgId) {
            return response.forbidden('Sem permissão para acessar esta mensagem')
          }

          // Verificar se é áudio
          if (!['audio', 'voice', 'ptt'].includes(message.type)) {
            return response.badRequest('Mensagem não é um áudio')
          }

          // Verificar se já tem transcrição
          if (message.transcription) {
            return response.success({
              data: {
                transcription: message.transcription,
                cached: true,
              }
            })
          }

          // Verificar se tem mediaUrl
          if (!message.mediaUrl) {
            return response.badRequest('Áudio não disponível para transcrição')
          }

          // Importar engine de transcrição
          const { transcriptionEngine } = await import('@/lib/transcription')

          console.log(`[MediaController] Transcribing message ${messageId}`)

          // Transcrever
          const result = await transcriptionEngine.transcribeAudio(message.mediaUrl)

          // Salvar transcrição no banco
          await database.message.update({
            where: { id: messageId },
            data: {
              transcription: result.text,
              transcriptionStatus: 'completed',
            }
          })

          console.log(`[MediaController] Transcription saved for message ${messageId}`)

          return response.success({
            data: {
              transcription: result.text,
              language: result.language,
              duration: result.duration,
              cached: false,
            }
          })

        } catch (error: any) {
          console.error('Erro ao transcrever áudio:', error)

          // Atualizar status de erro
          const messageId = (request as any).params?.messageId
          if (messageId) {
            await database.message.update({
              where: { id: messageId },
              data: { transcriptionStatus: 'failed' }
            }).catch(() => {})
          }

          return response.badRequest(error.message || 'Erro ao transcrever áudio')
        }
      }
    }),
  }
})
