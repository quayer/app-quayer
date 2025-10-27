/**
 * Sessions Controller
 *
 * Gerenciamento de sessões de atendimento WhatsApp
 * API REST para listar, buscar, bloquear/desbloquear IA, e encerrar sessões
 */

import { igniter } from '@/igniter';
import { database } from '@/services/database';
import { sessionsManager } from '@/lib/sessions/sessions.manager';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { z } from 'zod';

export const sessionsController = igniter.controller({
  name: 'sessions',
  path: '/sessions',
  description: 'Gerenciamento de sessões de atendimento WhatsApp',
  actions: {
    /**
     * GET /sessions
     * Listar sessões com filtros e paginação
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        organizationId: z.string().optional(),
        instanceId: z.string().optional(),
        contactId: z.string().optional(),
        status: z.enum(['QUEUED', 'ACTIVE', 'PAUSED', 'CLOSED']).optional(),
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        // Se não for admin, filtrar por organização do usuário
        // Admin pode ver todas orgs (se não passar organizationId) ou filtrar por uma específica
        const organizationId = user.role === 'admin'
          ? request.query.organizationId || undefined // Admin sem filtro = ver todas
          : user.currentOrgId; // Não-admin sempre filtrado pela org atual

        // Apenas não-admin precisa ter organizationId obrigatório
        if (user.role !== 'admin' && !organizationId) {
          return response.forbidden('Organização não encontrada');
        }

        const result = await sessionsManager.listSessions({
          organizationId,
          instanceId: request.query.instanceId,
          contactId: request.query.contactId,
          status: request.query.status,
          page: request.query.page,
          limit: request.query.limit,
        });

        return response.success(result);
      },
    }),

    /**
     * GET /sessions/:id
     * Buscar sessão por ID com mensagens
     */
    get: igniter.query({
      path: '/:id',
      params: z.object({ id: z.string() }),
      query: z.object({
        includeMessages: z.coerce.boolean().default(true),
        messagesLimit: z.coerce.number().min(1).max(500).default(100),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const session = await sessionsManager.getSessionById(request.params.id, {
          includeMessages: request.query.includeMessages,
          messagesLimit: request.query.messagesLimit,
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        // Verificar permissão (se não for admin, deve ser da mesma org)
        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta sessão');
        }

        return response.success(session);
      },
    }),

    /**
     * POST /sessions/:id/block-ai
     * Bloquear IA quando humano assume o atendimento
     */
    blockAI: igniter.mutation({
      path: '/:id/block-ai',
      params: z.object({ id: z.string() }),
      body: z.object({
        durationMinutes: z.number().min(1).max(1440).default(15), // Max 24 horas
        reason: z.string().optional().default('manual_response'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params;
        const { durationMinutes, reason } = request.body;

        // Verificar se sessão existe e pertence à org do usuário
        const session = await database.chatSession.findUnique({
          where: { id },
          select: { organizationId: true },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta sessão');
        }

        // Bloquear IA
        await sessionsManager.blockAI(id, durationMinutes, reason);

        return response.success({
          message: `IA bloqueada por ${durationMinutes} minutos`,
          blockedUntil: new Date(Date.now() + durationMinutes * 60 * 1000),
        });
      },
    }),

    /**
     * POST /sessions/:id/unblock-ai
     * Desbloquear IA manualmente
     */
    unblockAI: igniter.mutation({
      path: '/:id/unblock-ai',
      params: z.object({ id: z.string() }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params;

        // Verificar permissão
        const session = await database.chatSession.findUnique({
          where: { id },
          select: { organizationId: true },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta sessão');
        }

        // Desbloquear IA
        await sessionsManager.unblockAI(id);

        return response.success({ message: 'IA desbloqueada com sucesso' });
      },
    }),

    /**
     * POST /sessions/:id/close
     * Encerrar sessão
     */
    close: igniter.mutation({
      path: '/:id/close',
      params: z.object({ id: z.string() }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params;

        // Verificar permissão
        const session = await database.chatSession.findUnique({
          where: { id },
          select: { organizationId: true, status: true },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta sessão');
        }

        if (session.status === 'CLOSED') {
          return response.badRequest('Sessão já está encerrada');
        }

        // Encerrar sessão
        await sessionsManager.closeSession(id);

        return response.success({
          message: 'Sessão encerrada com sucesso',
          closedAt: new Date(),
        });
      },
    }),

    /**
     * PATCH /sessions/:id/status
     * Atualizar status da sessão
     */
    updateStatus: igniter.mutation({
      path: '/:id/status',
      params: z.object({ id: z.string() }),
      body: z.object({
        status: z.enum(['QUEUED', 'ACTIVE', 'PAUSED', 'CLOSED']),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params;
        const { status } = request.body;

        // Verificar permissão
        const session = await database.chatSession.findUnique({
          where: { id },
          select: { organizationId: true },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta sessão');
        }

        // Atualizar status
        await sessionsManager.updateSessionStatus(id, status);

        return response.success({
          message: `Status atualizado para ${status}`,
          status,
        });
      },
    }),

    /**
     * POST /sessions/:id/tags
     * Adicionar tags à sessão
     */
    addTags: igniter.mutation({
      path: '/:id/tags',
      params: z.object({ id: z.string() }),
      body: z.object({
        tags: z.array(z.string()).min(1),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params;
        const { tags } = request.body;

        // Verificar permissão
        const session = await database.chatSession.findUnique({
          where: { id },
          select: { organizationId: true },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta sessão');
        }

        // Adicionar tags
        await sessionsManager.addTags(id, tags);

        return response.success({
          message: `${tags.length} tag(s) adicionada(s)`,
          tags,
        });
      },
    }),

    /**
     * DELETE /sessions/:id/tags
     * Remover tags da sessão
     */
    removeTags: igniter.mutation({
      path: '/:id/tags',
      params: z.object({ id: z.string() }),
      body: z.object({
        tags: z.array(z.string()).min(1),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params;
        const { tags } = request.body;

        // Verificar permissão
        const session = await database.chatSession.findUnique({
          where: { id },
          select: { organizationId: true },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta sessão');
        }

        // Remover tags
        await sessionsManager.removeTags(id, tags);

        return response.success({
          message: `${tags.length} tag(s) removida(s)`,
          tags,
        });
      },
    }),

    /**
     * GET /sessions/:id/ai-status
     * Verificar se IA está bloqueada
     */
    checkAIStatus: igniter.query({
      path: '/:id/ai-status',
      params: z.object({ id: z.string() }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params;

        // Verificar permissão
        const session = await database.chatSession.findUnique({
          where: { id },
          select: {
            organizationId: true,
            aiEnabled: true,
            aiBlockedUntil: true,
            aiBlockReason: true,
          },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta sessão');
        }

        // Verificar se está bloqueada
        const isBlocked = await sessionsManager.isAIBlocked(id);

        return response.success({
          aiEnabled: session.aiEnabled,
          isBlocked,
          blockedUntil: session.aiBlockedUntil,
          blockReason: session.aiBlockReason,
        });
      },
    }),

    /**
     * GET /sessions/by-contact/:contactId
     * ⭐ CRITICAL - Formato falecomigo.ai
     * Buscar todas sessões e mensagens de um contato
     */
    byContact: igniter.query({
      path: '/by-contact/:contactId',
      params: z.object({ contactId: z.string() }),
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { contactId } = request.params;
        const { page, limit } = request.query;

        // Buscar contato
        const contact = await database.contact.findUnique({
          where: { id: contactId },
          include: {
            contactTabulations: {
              include: {
                tabulation: {
                  select: {
                    id: true,
                    name: true,
                    backgroundColor: true,
                    description: true,
                  },
                },
              },
            },
          },
        });

        if (!contact) {
          return response.notFound('Contato não encontrado');
        }

        // Verificar permissão
        if (user.role !== 'admin' && contact.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a este contato');
        }

        // Buscar sessões do contato
        const sessions = await database.chatSession.findMany({
          where: { contactId },
          include: {
            instance: {
              select: {
                id: true,
                name: true,
                brokerType: true,
              },
            },
            sessionTabulations: {
              include: {
                tabulation: {
                  select: {
                    id: true,
                    name: true,
                    backgroundColor: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 10, // Últimas 10 mensagens por sessão
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        // Buscar TODAS mensagens do contato (de todas as sessões)
        const skip = (page - 1) * limit;
        const [allMessages, totalMessages] = await Promise.all([
          database.message.findMany({
            where: { contactId },
            include: {
              contact: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phoneNumber: true,
                  organizationId: true,
                  externalId: true,
                  source: true,
                  bypassBots: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          database.message.count({ where: { contactId } }),
        ]);

        // Última sessão
        const lastSession = sessions[0] || null;
        const isLastSessionClosed = lastSession?.status === 'CLOSED';

        // Formatar resposta igual falecomigo.ai
        return response.success({
          contact: {
            ...contact,
            ContactTabulation: contact.contactTabulations.map((ct) => ({
              id: ct.id,
              contactId: ct.contactId,
              tabulationId: ct.tabulationId,
              createdAt: ct.createdAt,
              updatedAt: ct.updatedAt,
              tabulation: ct.tabulation,
            })),
          },
          sessions: sessions.map((session) => ({
            ...session,
            integration: {
              id: session.instance.id,
              name: session.instance.name,
              provider: {
                slug: session.instance.brokerType,
              },
            },
            tabulations: session.sessionTabulations.map((st) => st.tabulation),
          })),
          allMessages: allMessages.map((msg) => ({
            ...msg,
            startedBy: lastSession?.startedBy || 'CUSTOMER',
            sessionId: msg.sessionId,
            sessionCreatedAt: lastSession?.createdAt,
            sessionUpdatedAt: lastSession?.updatedAt,
            sessionStatus: lastSession?.status || 'QUEUED',
          })),
          isLastSessionClosed,
          lastSessionId: lastSession?.id || null,
          lastSessionStatus: lastSession?.status || null,
          lastSessionAssignedDepartment: lastSession?.assignedDepartmentId
            ? { id: lastSession.assignedDepartmentId, name: 'Department' }
            : null,
          integrationProviderKey: sessions[0]?.instance.brokerType || 'uazapi',
          integrationHasAgent: false,
          pagination: {
            total_data: totalMessages,
            total_pages: Math.ceil(totalMessages / limit),
            page,
            limit,
            has_next_page: page * limit < totalMessages,
            has_previous_page: page > 1,
          },
        });
      },
    }),

    /**
     * GET /sessions/contacts
     * ⭐ CRITICAL - View otimizada para UI de inbox (formato falecomigo.ai)
     * Lista contatos com última mensagem, contador de não lidas, tabulações, etc.
     */
    contactsView: igniter.query({
      path: '/contacts',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(10),
        status: z.enum(['QUEUED', 'ACTIVE', 'PAUSED', 'CLOSED']).optional(),
        responseFilter: z.enum(['all', 'unanswered', 'answered']).default('all'),
        search: z.string().optional(), // Buscar por nome ou telefone
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { page, limit, status, responseFilter, search } = request.query;
        const organizationId = user.role === 'admin' ? undefined : user.currentOrgId;

        if (user.role !== 'admin' && !organizationId) {
          return response.forbidden('Organização não encontrada');
        }

        const skip = (page - 1) * limit;

        // Construir filtros de sessões
        const sessionWhere: any = {
          ...(organizationId && { organizationId }),
          ...(status && { status }),
        };

        // Buscar sessões com relacionamentos otimizados
        const sessions = await database.chatSession.findMany({
          where: sessionWhere,
          skip,
          take: limit,
          orderBy: { updatedAt: 'desc' },
          include: {
            contact: {
              include: {
                contactTabulations: {
                  include: {
                    tabulation: {
                      select: {
                        id: true,
                        name: true,
                        backgroundColor: true,
                        description: true,
                      },
                    },
                  },
                },
              },
            },
            instance: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                brokerType: true,
              },
            },
            sessionTabulations: {
              include: {
                tabulation: {
                  select: {
                    id: true,
                    name: true,
                    backgroundColor: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1, // Apenas última mensagem
            },
          },
        });

        const total = await database.chatSession.count({ where: sessionWhere });

        // Formatar resposta igual falecomigo.ai
        const formattedData = await Promise.all(
          sessions.map(async (session) => {
            const lastMessage = session.messages[0];

            // Contar mensagens não lidas (autor CUSTOMER, direction INBOUND, status != READ)
            const unreadMessages = await database.message.count({
              where: {
                sessionId: session.id,
                author: 'CUSTOMER',
                direction: 'INBOUND',
                status: { not: 'READ' },
              },
            });

            return {
              id: session.contact.id,
              name: session.contact.name,
              isBotMuted: session.contact.bypassBots || false,
              phoneNumber: session.contact.phoneNumber,
              email: session.contact.email,
              sessionId: session.id,
              sessionStatus: session.status,
              sessionCreatedAt: session.createdAt,
              sessionUpdatedAt: session.updatedAt,
              sessionIntegrationId: session.instance.id,
              sessionIntegration: {
                id: session.instance.id,
                provider: {
                  id: session.instance.id,
                  name: session.instance.brokerType,
                  slug: session.instance.brokerType,
                  icon: 'https://storage.falecomigo.ai/falecomigo.ai/assets/whatsapp.png',
                },
                name: session.instance.name,
                phoneNumber: session.instance.phoneNumber,
              },
              assignedDepartment: session.assignedDepartmentId
                ? {
                    id: session.assignedDepartmentId,
                    name: 'Geral',
                    slug: 'geral',
                  }
                : null,
              watchers: [], // TODO: Implementar watchers quando houver tabela
              lastMessageId: lastMessage?.id || null,
              lastMessage: lastMessage?.content || null,
              lastMessageTime: lastMessage?.createdAt || null,
              lastMessageType: lastMessage?.type || null,
              lastMessageDirection: lastMessage?.direction || null,
              lastMessageAuthor: lastMessage?.author || null,
              lastMessageStatus: lastMessage?.status || null,
              unreadMessages,
              tabulations: session.sessionTabulations.map((st) => st.tabulation),
              ContactTabulation: session.contact.contactTabulations.map((ct) => ({
                id: ct.id,
                contactId: ct.contactId,
                tabulationId: ct.tabulationId,
                createdAt: ct.createdAt,
                updatedAt: ct.updatedAt,
                tabulation: ct.tabulation,
              })),
            };
          })
        );

        // Aplicar filtro de busca se fornecido
        let filteredData = formattedData;
        if (search) {
          const searchLower = search.toLowerCase();
          filteredData = formattedData.filter(
            (item) =>
              item.name?.toLowerCase().includes(searchLower) ||
              item.phoneNumber?.includes(search)
          );
        }

        // Aplicar filtro de resposta
        if (responseFilter === 'unanswered') {
          filteredData = filteredData.filter((item) => item.unreadMessages > 0);
        } else if (responseFilter === 'answered') {
          filteredData = filteredData.filter((item) => item.unreadMessages === 0);
        }

        return response.success({
          data: filteredData,
          pagination: {
            total_data: total,
            total_pages: Math.ceil(total / limit),
            page,
            limit,
          },
        });
      },
    }),
  },
});
