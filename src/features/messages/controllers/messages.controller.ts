/**
 * Messages Controller
 * ⭐ CRITICAL - Formato falecomigo.ai
 * 🚀 Provider-Agnostic: Funciona igual para UAZAPI, CloudAPI e futuros providers
 * Gerenciamento de mensagens dentro de sessões
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { database } from '@/services/database';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { orchestrator } from '@/lib/providers';
import { sessionsManager } from '@/lib/sessions/sessions.manager';
import { sessionRateLimiter } from '@/lib/rate-limit/rate-limiter';
import { retryWithBackoff } from '@/services/circuit-breaker';
import type { BrokerType } from '@/lib/providers/core/provider.types';

/**
 * Helper: Mapeia provider do banco para BrokerType do orchestrator
 * Provider-Agnostic: Suporta tanto providers antigos quanto novos
 */
function mapProviderToBrokerType(provider: string): BrokerType {
  const mapping: Record<string, BrokerType> = {
    'WHATSAPP_WEB': 'uazapi',
    'WHATSAPP_CLOUD_API': 'cloudapi',
    'WHATSAPP': 'uazapi',
    'uazapi': 'uazapi',
    'cloudapi': 'cloudapi',
  };
  return mapping[provider] || 'uazapi';
}

export const messagesController = igniter.controller({
  name: 'messages',
  path: '/messages',
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
      method: 'POST',
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
          .enum(['pending', 'sent', 'delivered', 'read', 'failed'])
          .optional()
          .default('pending'),
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

        const { sessionId } = request.body;

        // 🚀 Rate Limiting: Verificar limite por sessão (20 msgs/min)
        const rateLimitResult = await sessionRateLimiter.check(sessionId);
        if (!rateLimitResult.success) {
          return response.badRequest(
            `Limite de mensagens excedido. Aguarde ${rateLimitResult.retryAfter || 60} segundos.`,
            {
              code: 'RATE_LIMITED',
              retryAfter: rateLimitResult.retryAfter || 60,
              remaining: rateLimitResult.remaining,
              reset: rateLimitResult.reset,
            }
          );
        }

        const {
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
            connection: true,
          },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        // 2. VERIFICAR PERMISSÕES
        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta sessão');
        }

        // 2.5. VERIFICAR STATUS DA CONEXÃO (se vai enviar externamente)
        if (sendExternalMessage && direction === 'OUTBOUND') {
          const connectionStatus = session.connection.status;
          if (connectionStatus === 'DISCONNECTED' || connectionStatus === 'ERROR') {
            return response.badRequest(
              'WhatsApp desconectado. Reconecte a instância para enviar mensagens.',
              { code: 'INSTANCE_DISCONNECTED', instanceId: session.connectionId }
            );
          }
        }

        // 3. SE SESSÃO ESTÁ FECHADA, REABRIR AUTOMATICAMENTE
        if (session.status === 'CLOSED') {
          await database.chatSession.update({
            where: { id: sessionId },
            data: {
              status: 'ACTIVE',
              closedAt: null,
              endReason: null,
            },
          });
          console.log(`[MessagesController.create] Session ${sessionId} reopened automatically for message send`);
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
            connectionId: session.connectionId,
            waMessageId,
            direction: direction!,
            type,
            author,
            content,
            status,
            mediaUrl,
            fileName: filename,
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
        // 🚀 Provider-Agnostic: Usa o orchestrator para todas as operações
        if (sendExternalMessage && direction === 'OUTBOUND') {
          try {
            const brokerType = mapProviderToBrokerType(session.connection.provider);

            // 6.1. EFEITO DIGITANDO (se showTyping = true)
            if (showTyping) {
              await orchestrator.sendPresence(
                session.connectionId,
                brokerType,
                session.contact.phoneNumber,
                'composing'
              );
            }

            // 6.2. DELAY (se delayMs > 0)
            if (delayMs && delayMs > 0) {
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }

            // 6.3. ENVIAR MENSAGEM conforme tipo (com retry automatico)
            const retryOptions = { maxRetries: 2, baseDelay: 1000, maxDelay: 5000 };

            if (type === 'text') {
              // Texto simples
              await retryWithBackoff(
                () => orchestrator.sendText(session.connectionId, brokerType, {
                  to: session.contact.phoneNumber,
                  text: content,
                }),
                retryOptions
              );
            } else if (type === 'list') {
              // Lista interativa (provider-agnostic)
              await retryWithBackoff(
                () => orchestrator.sendInteractiveList(session.connectionId, brokerType, {
                  to: session.contact.phoneNumber,
                  title: interactiveData?.title || '',
                  description: interactiveData?.description || content,
                  buttonText: interactiveData?.buttonText || 'Selecionar',
                  sections: interactiveData?.sections || [],
                  footer: interactiveData?.footer,
                }),
                retryOptions
              );
            } else if (type === 'buttons') {
              // Botoes interativos (provider-agnostic)
              await retryWithBackoff(
                () => orchestrator.sendInteractiveButtons(session.connectionId, brokerType, {
                  to: session.contact.phoneNumber,
                  text: interactiveData?.text || content,
                  buttons: interactiveData?.buttons || [],
                  footer: interactiveData?.footer,
                  header: interactiveData?.header,
                }),
                retryOptions
              );
            } else if (type === 'location') {
              // Localizacao (provider-agnostic)
              await retryWithBackoff(
                () => orchestrator.sendLocation(session.connectionId, brokerType, {
                  to: session.contact.phoneNumber,
                  latitude: interactiveData?.latitude || interactiveData?.lat,
                  longitude: interactiveData?.longitude || interactiveData?.lng,
                  name: interactiveData?.name,
                  address: interactiveData?.address,
                }),
                retryOptions
              );
            } else if (type === 'contact') {
              // Contato (provider-agnostic)
              await retryWithBackoff(
                () => orchestrator.sendContact(session.connectionId, brokerType, {
                  to: session.contact.phoneNumber,
                  contact: {
                    name: interactiveData?.contact?.name || interactiveData?.name,
                    phone: interactiveData?.contact?.phone || interactiveData?.contact?.number || interactiveData?.number,
                  },
                }),
                retryOptions
              );
            } else if (mediaUrl) {
              // Midia (image, video, audio, document)
              await retryWithBackoff(
                () => orchestrator.sendMedia(session.connectionId, brokerType, {
                  to: session.contact.phoneNumber,
                  mediaUrl,
                  mediaType: type,
                  caption: caption || content,
                  fileName: filename,
                }),
                retryOptions
              );
            }

            // 6.4. PARAR EFEITO DIGITANDO
            if (showTyping) {
              await orchestrator.sendPresence(
                session.connectionId,
                brokerType,
                session.contact.phoneNumber,
                'paused'
              );
            }

            // 6.5. Atualizar status
            await database.message.update({
              where: { id: message.id },
              data: { status: 'sent' },
            });
          } catch (error) {
            console.error('[MessagesController] Erro ao enviar:', error);

            await database.message.update({
              where: { id: message.id },
              data: { status: 'failed' },
            });

            return response.badRequest(`Falha ao enviar mensagem via WhatsApp: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
          }
        }

        // 7. PAUSAR SESSÃO (se pauseSession = true)
        if (pauseSession) {
          await sessionsManager.updateSessionStatus(
            sessionId,
            'PAUSED'
          );
        }

        // 8. BLOQUEAR IA (quando agente humano responde)
        // Usa autoPauseOnHumanReply para pausar IA automaticamente
        if (author === 'AGENT' && direction === 'OUTBOUND') {
          // Buscar configurações da conexão (ConnectionSettings model)
          const connectionSettings = await database.connectionSettings.findUnique({
            where: { connectionId: session.connectionId },
            select: {
              autoPauseOnHumanReply: true,
              autoPauseDurationHours: true,
            },
          });

          // Se auto-pause está habilitado (default: true), usar duração configurada
          if (connectionSettings?.autoPauseOnHumanReply !== false) {
            const pauseDurationMinutes = (connectionSettings?.autoPauseDurationHours || 24) * 60;
            await sessionsManager.blockAI(sessionId, pauseDurationMinutes, 'AUTO_PAUSED_HUMAN');
            console.log(`[MessagesController] IA bloqueada por ${pauseDurationMinutes} minutos devido a resposta humana`);
          }
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
          mediaUrl: message.mediaUrl,
          fileName: message.fileName,
          createdAt: message.createdAt,
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
        const where: any = {
          // Excluir mensagens originais de grupos de concatenação (apenas a concatenada é exibida)
          // Mensagens com concatGroupId != null E isConcatenated = false são as originais
          OR: [
            { concatGroupId: null },  // Mensagens não concatenadas
            { isConcatenated: true }, // Mensagem concatenada (a que deve ser exibida)
          ],
        };

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

        const skip = (page! - 1) * limit!;

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
            total_pages: Math.ceil(total / limit!),
            page: page!,
            limit: limit!,
            has_next_page: page! * limit! < total,
            has_previous_page: page! > 1,
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
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params as any;

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
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params as any;

        // 1. Buscar mensagem
        const message = await database.message.findUnique({
          where: { id },
          include: {
            session: {
              include: {
                connection: true,
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
        if (!message.mediaUrl && !message.waMessageId) {
          return response.badRequest('Mensagem não possui mídia');
        }

        // 4. Download via Orchestrator (Provider-Agnostic)
        try {
          const connection = message.session.connection;
          const brokerType = mapProviderToBrokerType(connection.provider);

          // Se já tiver mediaUrl (URL pública), retornar direto
          if (message.mediaUrl && message.mediaUrl.startsWith('http')) {
            return response.success({
              messageId: message.id,
              mediaUrl: message.mediaUrl,
              fileName: message.fileName,
              mimeType: message.type,
            });
          }

          // Caso contrário, baixar via orchestrator usando waMessageId
          const media = await orchestrator.downloadMedia(
            connection.id,
            brokerType,
            message.waMessageId
          );

          return response.success({
            messageId: message.id,
            data: media.data, // Base64
            fileName: media.fileName || message.fileName,
            mimeType: media.mimeType,
            size: media.size,
          });
        } catch (error) {
          console.error('[MessagesController] Erro ao baixar mídia:', error);
          return response.badRequest(`Erro ao baixar mídia: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
      },
    }),

    /**
     * POST /messages/:id/react
     * Reagir à mensagem com emoji
     */
    react: igniter.mutation({
      path: '/:id/react',
      method: 'POST',
      body: z.object({
        emoji: z.string().min(1).max(10, 'Emoji inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params as any;
        const { emoji } = request.body;

        // 1. Buscar mensagem
        const message = await database.message.findUnique({
          where: { id },
          include: {
            session: {
              include: {
                connection: true,
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

        // 3. Reagir via Orchestrator (Provider-Agnostic)
        try {
          const connection = message.session.connection;
          const brokerType = mapProviderToBrokerType(connection.provider);

          await orchestrator.reactToMessage(
            connection.id,
            brokerType,
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
          return response.badRequest(`Erro ao reagir à mensagem: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
      },
    }),

    /**
     * DELETE /messages/:id
     * Deletar mensagem (para todos)
     */
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params as any;

        // 1. Buscar mensagem
        const message = await database.message.findUnique({
          where: { id },
          include: {
            session: {
              include: {
                connection: true,
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

        // 3. Deletar via Orchestrator (Provider-Agnostic)
        try {
          const connection = message.session.connection;
          const brokerType = mapProviderToBrokerType(connection.provider);

          await orchestrator.deleteMessage(
            connection.id,
            brokerType,
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
          return response.badRequest(`Erro ao deletar mensagem: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
      },
    }),

    /**
     * POST /messages/:id/mark-read
     * Marcar mensagem como lida
     */
    markAsRead: igniter.mutation({
      path: '/:id/mark-read',
      method: 'PATCH',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params as any;

        // 1. Buscar mensagem
        const message = await database.message.findUnique({
          where: { id },
          include: {
            session: {
              include: {
                connection: true,
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

        // 3. Marcar como lida via Orchestrator (Provider-Agnostic)
        try {
          const connection = message.session.connection;
          const brokerType = mapProviderToBrokerType(connection.provider);

          await orchestrator.markAsRead(
            connection.id,
            brokerType,
            message.waMessageId
          );

          // 4. Atualizar status no banco
          await database.message.update({
            where: { id },
            data: { status: 'read' },
          });

          return response.success({
            message: 'Mensagem marcada como lida',
            messageId: message.id,
          });
        } catch (error) {
          console.error('[MessagesController] Erro ao marcar como lida:', error);
          return response.badRequest(`Erro ao marcar mensagem como lida: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
      },
    }),
  },
});
