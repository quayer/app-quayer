/**
 * Messages Controller
 * ⭐ CRITICAL - Formato falecomigo.ai
 * Gerenciamento de mensagens dentro de sessões
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { database } from '@/services/database';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { orchestrator } from '@/lib/providers/core/orchestrator';
import { sessionsManager } from '@/lib/sessions/sessions.manager';
import { uazService } from '@/lib/uaz/uaz.service';
import type { BrokerType } from '@/lib/providers/core/provider.types';

export const messagesController = igniter.controller({
  name: 'messages',
  description: 'Gerenciamento de mensagens do sistema',

  actions: {
    /**
     * POST /messages
     * ⭐ CRITICAL - Criar e enviar mensagem (formato falecomigo.ai)
     *
     * @param sessionId - ID da sessão
     * @param type - Tipo de mensagem (text, image, audio, video, document)
     * @param direction - Direção (INBOUND, OUTBOUND)
     * @param author - Autor (CUSTOMER, AGENT, AI, BUSINESS, SYSTEM, AGENT_PLATFORM)
     * @param content - Conteúdo da mensagem
     * @param pauseSession - Se true, pausa a sessão após enviar
     * @param status - Status da mensagem (PENDING, SENT, DELIVERED, READ, FAILED)
     * @param externalId - ID externo (ex: ID do CRM)
     * @param sendExternalMessage - Se true, envia via WhatsApp; se false, apenas salva no DB
     * @param delayMs - Delay em milissegundos antes de enviar (0-30000)
     * @param showTyping - Se true, mostra "digitando..." antes de enviar
     */
    create: igniter.mutation({
      path: '/',
      body: z.object({
        sessionId: z.string().uuid('ID da sessão inválido'),
        type: z.enum(['text', 'image', 'audio', 'video', 'document', 'location', 'contact', 'list', 'buttons']),
        direction: z.enum(['INBOUND', 'OUTBOUND']).default('OUTBOUND'),
        author: z
          .enum(['CUSTOMER', 'AGENT', 'AI', 'BUSINESS', 'SYSTEM', 'AGENT_PLATFORM'])
          .default('AGENT'),
        content: z.string().min(1, 'Conteúdo não pode estar vazio'),

        // Opcionais
        pauseSession: z.boolean().optional().default(false),
        status: z
          .enum(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'])
          .optional()
          .default('PENDING'),
        externalId: z.string().optional(),
        sendExternalMessage: z.boolean().optional().default(true),

        // Para mídias
        mediaUrl: z.string().url().optional(),
        caption: z.string().optional(),
        filename: z.string().optional(),

        // NOVOS: Delay e Typing
        delayMs: z.number().int().min(0).max(30000).optional().default(0),
        showTyping: z.boolean().optional().default(false),

        // NOVOS: Para mensagens interativas (list e buttons)
        interactiveData: z.any().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const {
          sessionId,
          type,
          direction,
          author,
          content,
          pauseSession,
          status,
          externalId,
          sendExternalMessage,
          mediaUrl,
          caption,
          filename,
          delayMs,
          showTyping,
          interactiveData,
        } = request.body;

        // 1. BUSCAR SESSÃO
        const session = await database.chatSession.findUnique({
          where: { id: sessionId },
          include: {
            contact: true,
            instance: true,
          },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        // 2. VERIFICAR PERMISSÕES
        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta sessão');
        }

        // 3. VERIFICAR SE SESSÃO ESTÁ FECHADA
        if (session.status === 'CLOSED') {
          return response.badRequest(
            'Não é possível enviar mensagens para uma sessão fechada'
          );
        }

        // 4. GERAR waMessageId único
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const waMessageId = `msg_${timestamp}_${random}`;

        // 5. SALVAR MENSAGEM NO BANCO
        const message = await database.message.create({
          data: {
            sessionId,
            contactId: session.contactId,
            instanceId: session.instanceId,
            waMessageId,
            direction,
            type,
            author,
            content,
            status,
            externalId,
            mediaUrl,
            caption,
            filename,
          },
          include: {
            contact: {
              select: {
                id: true,
                phoneNumber: true,
                name: true,
                profilePicUrl: true,
              },
            },
          },
        });

        // 6. ENVIAR VIA WHATSAPP (se sendExternalMessage = true)
        if (sendExternalMessage && direction === 'OUTBOUND') {
          try {
            const brokerType = session.instance.brokerType as BrokerType;
            const uazToken = session.instance.uazToken;

            if (!uazToken) {
              throw new Error('Instância sem token UAZ configurado');
            }

            // 6.1. EFEITO DIGITANDO (se showTyping = true)
            if (showTyping) {
              await uazService.sendPresence(uazToken, session.contact.phoneNumber, 'composing');
            }

            // 6.2. DELAY (se delayMs > 0)
            if (delayMs > 0) {
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }

            // 6.3. ENVIAR MENSAGEM conforme tipo
            if (type === 'text') {
              // Texto simples
              await orchestrator.sendText(session.instanceId, brokerType, {
                to: session.contact.phoneNumber,
                text: content,
              });
            } else if (type === 'list') {
              // Lista interativa
              await uazService.sendList(uazToken, {
                number: session.contact.phoneNumber,
                ...interactiveData,
              });
            } else if (type === 'buttons') {
              // Botões interativos
              await uazService.sendButtons(uazToken, {
                number: session.contact.phoneNumber,
                ...interactiveData,
              });
            } else if (type === 'location') {
              // Localização
              await uazService.sendLocation(uazToken, {
                number: session.contact.phoneNumber,
                ...interactiveData,
              });
            } else if (type === 'contact') {
              // Contato
              await uazService.sendContact(uazToken, {
                number: session.contact.phoneNumber,
                ...interactiveData,
              });
            } else if (mediaUrl) {
              // Mídia (image, video, audio, document)
              await orchestrator.sendMedia(session.instanceId, brokerType, {
                to: session.contact.phoneNumber,
                mediaUrl,
                mediaType: type,
                caption: caption || content,
                filename,
              });
            }

            // 6.4. PARAR EFEITO DIGITANDO
            if (showTyping) {
              await uazService.sendPresence(uazToken, session.contact.phoneNumber, 'paused');
            }

            // 6.5. Atualizar status
            await database.message.update({
              where: { id: message.id },
              data: { status: 'SENT' },
            });
          } catch (error) {
            console.error('[MessagesController] Erro ao enviar:', error);

            await database.message.update({
              where: { id: message.id },
              data: { status: 'FAILED' },
            });

            return response.error('Falha ao enviar mensagem via WhatsApp', {
              error: error instanceof Error ? error.message : 'Erro desconhecido',
            });
          }
        }

        // 7. PAUSAR SESSÃO (se pauseSession = true)
        if (pauseSession) {
          await sessionsManager.updateSessionStatus(
            sessionId,
            'PAUSED',
            'Pausado após envio de mensagem'
          );
        }

        // 8. BLOQUEAR IA (quando agente humano responde)
        if (author === 'AGENT' && direction === 'OUTBOUND') {
          await sessionsManager.blockAI(sessionId, 60, 'agent_response');
        }

        return response.success({
          id: message.id,
          sessionId: message.sessionId,
          contactId: message.contactId,
          waMessageId: message.waMessageId,
          direction: message.direction,
          type: message.type,
          author: message.author,
          content: message.content,
          status: message.status,
          externalId: message.externalId,
          mediaUrl: message.mediaUrl,
          caption: message.caption,
          filename: message.filename,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
          contact: message.contact,
        });
      },
    }),

    /**
     * GET /messages
     * Listar mensagens com filtros
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        sessionId: z.string().uuid().optional(),
        contactId: z.string().uuid().optional(),
        direction: z.enum(['INBOUND', 'OUTBOUND']).optional(),
        author: z
          .enum(['CUSTOMER', 'AGENT', 'AI', 'BUSINESS', 'SYSTEM', 'AGENT_PLATFORM'])
          .optional(),
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { sessionId, contactId, direction, author, page, limit } = request.query;

        // Construir filtros
        const where: any = {};

        if (sessionId) where.sessionId = sessionId;
        if (contactId) where.contactId = contactId;
        if (direction) where.direction = direction;
        if (author) where.author = author;

        // Admin: pode ver qualquer organização
        // User: apenas sua organização
        if (user.role !== 'admin') {
          where.session = {
            organizationId: user.currentOrgId,
          };
        }

        const skip = (page - 1) * limit;

        // Buscar mensagens e total
        const [messages, total] = await Promise.all([
          database.message.findMany({
            where,
            include: {
              contact: {
                select: {
                  id: true,
                  phoneNumber: true,
                  name: true,
                  profilePicUrl: true,
                },
              },
              session: {
                select: {
                  id: true,
                  status: true,
                  organizationId: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          database.message.count({ where }),
        ]);

        return response.success({
          data: messages,
          pagination: {
            total_data: total,
            total_pages: Math.ceil(total / limit),
            page,
            limit,
            has_next_page: page * limit < total,
            has_previous_page: page > 1,
          },
        });
      },
    }),

    /**
     * GET /messages/:id
     * Buscar mensagem por ID
     */
    getById: igniter.query({
      path: '/:id',
      params: z.object({
        id: z.string().uuid('ID inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params;

        const message = await database.message.findUnique({
          where: { id },
          include: {
            contact: {
              select: {
                id: true,
                phoneNumber: true,
                name: true,
                profilePicUrl: true,
              },
            },
            session: {
              select: {
                id: true,
                status: true,
                organizationId: true,
              },
            },
          },
        });

        if (!message) {
          return response.notFound('Mensagem não encontrada');
        }

        // Verificar permissões
        if (user.role !== 'admin' && message.session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta mensagem');
        }

        return response.success(message);
      },
    }),

    /**
     * GET /messages/:id/download
     * Download mídia da mensagem
     */
    downloadMedia: igniter.query({
      path: '/:id/download',
      params: z.object({
        id: z.string().uuid('ID inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params;

        // 1. Buscar mensagem
        const message = await database.message.findUnique({
          where: { id },
          include: {
            session: {
              include: {
                instance: true,
              },
            },
          },
        });

        if (!message) {
          return response.notFound('Mensagem não encontrada');
        }

        // 2. Verificar permissões
        if (user.role !== 'admin' && message.session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        // 3. Verificar se mensagem tem mídia
        if (!message.mediaUrl && !message.externalId) {
          return response.badRequest('Mensagem não possui mídia');
        }

        // 4. Download via UAZ API
        try {
          const instance = message.session.instance;
          if (!instance.uazToken) {
            return response.error('Instância sem token UAZ configurado');
          }

          // Se já tiver mediaUrl (URL pública), retornar direto
          if (message.mediaUrl && message.mediaUrl.startsWith('http')) {
            return response.success({
              messageId: message.id,
              mediaUrl: message.mediaUrl,
              filename: message.filename,
              mimeType: message.type,
              caption: message.caption,
            });
          }

          // Caso contrário, baixar via UAZ usando waMessageId
          const media = await uazService.downloadMedia(
            instance.uazToken,
            message.waMessageId
          );

          return response.success({
            messageId: message.id,
            data: media.data, // Base64
            filename: media.fileName || message.filename,
            mimeType: media.mimetype,
            size: media.size,
            caption: message.caption,
          });
        } catch (error) {
          console.error('[MessagesController] Erro ao baixar mídia:', error);
          return response.error('Erro ao baixar mídia', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * POST /messages/:id/react
     * Reagir à mensagem com emoji
     */
    react: igniter.mutation({
      path: '/:id/react',
      params: z.object({
        id: z.string().uuid('ID inválido'),
      }),
      body: z.object({
        emoji: z.string().min(1).max(10, 'Emoji inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params;
        const { emoji } = request.body;

        // 1. Buscar mensagem
        const message = await database.message.findUnique({
          where: { id },
          include: {
            session: {
              include: {
                instance: true,
                contact: true,
              },
            },
          },
        });

        if (!message) {
          return response.notFound('Mensagem não encontrada');
        }

        // 2. Verificar permissões
        if (user.role !== 'admin' && message.session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        // 3. Reagir via UAZ
        try {
          const instance = message.session.instance;
          if (!instance.uazToken) {
            return response.error('Instância sem token UAZ');
          }

          await uazService.reactToMessage(
            instance.uazToken,
            message.waMessageId,
            emoji
          );

          return response.success({
            message: 'Reação enviada com sucesso',
            messageId: message.id,
            emoji,
          });
        } catch (error) {
          console.error('[MessagesController] Erro ao reagir:', error);
          return response.error('Erro ao reagir à mensagem', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * DELETE /messages/:id
     * Deletar mensagem (para todos)
     */
    delete: igniter.mutation({
      path: '/:id',
      params: z.object({
        id: z.string().uuid('ID inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params;

        // 1. Buscar mensagem
        const message = await database.message.findUnique({
          where: { id },
          include: {
            session: {
              include: {
                instance: true,
              },
            },
          },
        });

        if (!message) {
          return response.notFound('Mensagem não encontrada');
        }

        // 2. Verificar permissões
        if (user.role !== 'admin' && message.session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        // 3. Deletar via UAZ
        try {
          const instance = message.session.instance;
          if (!instance.uazToken) {
            return response.error('Instância sem token UAZ');
          }

          await uazService.deleteMessage(
            instance.uazToken,
            message.waMessageId
          );

          // 4. Atualizar no banco (soft delete ou marcar como deletada)
          await database.message.update({
            where: { id },
            data: {
              content: '[Mensagem deletada]',
              mediaUrl: null,
            },
          });

          return response.success({
            message: 'Mensagem deletada com sucesso',
            messageId: message.id,
          });
        } catch (error) {
          console.error('[MessagesController] Erro ao deletar:', error);
          return response.error('Erro ao deletar mensagem', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * POST /messages/:id/mark-read
     * Marcar mensagem como lida
     */
    markAsRead: igniter.mutation({
      path: '/:id/mark-read',
      params: z.object({
        id: z.string().uuid('ID inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params;

        // 1. Buscar mensagem
        const message = await database.message.findUnique({
          where: { id },
          include: {
            session: {
              include: {
                instance: true,
                contact: true,
              },
            },
          },
        });

        if (!message) {
          return response.notFound('Mensagem não encontrada');
        }

        // 2. Verificar permissões
        if (user.role !== 'admin' && message.session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        // 3. Marcar como lida via UAZ
        try {
          const instance = message.session.instance;
          if (!instance.uazToken) {
            return response.error('Instância sem token UAZ');
          }

          await uazService.markAsRead(
            instance.uazToken,
            message.waMessageId
          );

          // 4. Atualizar status no banco
          await database.message.update({
            where: { id },
            data: { status: 'READ' },
          });

          return response.success({
            message: 'Mensagem marcada como lida',
            messageId: message.id,
          });
        } catch (error) {
          console.error('[MessagesController] Erro ao marcar como lida:', error);
          return response.error('Erro ao marcar mensagem como lida', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),
  },
});
