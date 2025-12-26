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
import { sseEvents } from '@/lib/events/sse-events.service';

export const sessionsController = igniter.controller({
  name: 'sessions',
  path: '/sessions',
  description: 'Gerenciamento de sessões de atendimento WhatsApp',
  actions: {
    /**
     * GET /sessions
     * Listar sessões com filtros e paginação
     * ✅ Caching: 30 segundos por query unique
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        organizationId: z.string().optional(),
        connectionId: z.string().optional(),
        contactId: z.string().optional(),
        status: z.enum(['QUEUED', 'ACTIVE', 'PAUSED', 'CLOSED']).optional(),
        // ⭐ NOVOS FILTROS AVANÇADOS
        aiStatus: z.enum(['enabled', 'disabled', 'blocked']).optional(), // Status da IA
        whatsappWindow: z.enum(['active', 'expiring', 'expired', 'none']).optional(), // Janela 24h
        assignedAgentId: z.string().optional(), // Atendente atribuído
        hasUnread: z.coerce.boolean().optional(), // Mensagens não lidas
        search: z.string().optional(), // Busca por nome/telefone
        sortBy: z.enum(['lastMessage', 'created', 'updated']).default('lastMessage'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
        // 🚀 Paginação cursor-based (mais eficiente para grandes volumes)
        cursor: z.string().optional(), // ID da última sessão recebida
        useCursor: z.coerce.boolean().optional(), // Se true, usa cursor em vez de offset
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
          : user.currentOrgId || undefined; // Não-admin sempre filtrado pela org atual

        // Apenas não-admin precisa ter organizationId obrigatório
        if (user.role !== 'admin' && !organizationId) {
          return response.forbidden('Organização não encontrada');
        }

        // 🚀 Cache: Verificar cache antes de buscar no banco
        const cacheKey = `sessions:list:${organizationId || 'all'}:${request.query.connectionId || ''}:${request.query.status || ''}:${request.query.aiStatus || ''}:${request.query.whatsappWindow || ''}:${request.query.search || ''}:${request.query.sortBy}:${request.query.sortOrder}:${request.query.page}:${request.query.limit}:${request.query.cursor || ''}:${request.query.useCursor || ''}`;

        try {
          const cached = await igniter.store.get<any>(cacheKey);
          if (cached) {
            return response.success({ ...cached, source: 'cache' });
          }
        } catch (e) {
          // Cache miss ou erro - continuar sem cache
        }

        const result = await sessionsManager.listSessions({
          organizationId,
          connectionId: request.query.connectionId,
          contactId: request.query.contactId,
          status: request.query.status,
          // ⭐ Filtros avançados
          aiStatus: request.query.aiStatus,
          whatsappWindow: request.query.whatsappWindow,
          assignedAgentId: request.query.assignedAgentId,
          hasUnread: request.query.hasUnread,
          search: request.query.search,
          sortBy: request.query.sortBy,
          sortOrder: request.query.sortOrder,
          page: request.query.page,
          limit: request.query.limit,
          // 🚀 Paginação cursor-based
          cursor: request.query.cursor,
          useCursor: request.query.useCursor,
        });

        // 🚀 Cache: Salvar resultado com TTL de 30 segundos
        try {
          await igniter.store.set(cacheKey, result, { ttl: 30 });
        } catch (e) {
          // Erro ao salvar cache - não crítico
        }

        return response.success(result);
      },
    }),

    /**
     * GET /sessions/:id
     * Buscar sessão por ID com mensagens
     */
    get: igniter.query({
      path: '/:id',
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

        const { id } = request.params as { id: string };
        const session = await sessionsManager.getSessionById(id, {
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
      method: 'POST',
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

        const { id } = request.params as { id: string };
        const { durationMinutes = 15, reason = 'manual_response' } = request.body;

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
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

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
      path: '/:id/close' as const,
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

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
      method: 'PATCH',
      body: z.object({
        status: z.enum(['QUEUED', 'ACTIVE', 'PAUSED', 'CLOSED']),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };
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
     * PATCH /sessions/:id/department
     * Atualizar departamento da sessão
     */
    updateDepartment: igniter.mutation({
      path: '/:id/department' as const,
      method: 'PATCH',
      body: z.object({
        departmentId: z.string().nullable(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };
        const { departmentId } = request.body;

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

        // Atualizar departamento
        const updated = await database.chatSession.update({
          where: { id },
          data: { assignedDepartmentId: departmentId },
          include: {
            department: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        });

        return response.success({
          message: departmentId
            ? `Sessão transferida para ${updated.department?.name || 'departamento'}`
            : 'Departamento removido da sessão',
          department: updated.department,
        });
      },
    }),

    /**
     * POST /sessions/:id/tags
     * Adicionar tags à sessão
     */
    addTags: igniter.mutation({
      path: '/:id/tags',
      method: 'POST',
      body: z.object({
        tags: z.array(z.string()).min(1),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };
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
      method: 'DELETE',
      body: z.object({
        tags: z.array(z.string()).min(1),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };
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
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

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

        const { contactId } = request.params as { contactId: string };
        const page = request.query.page ?? 1;
        const limit = request.query.limit ?? 50;

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
            connection: {
              select: {
                id: true,
                name: true,
                provider: true,
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
              id: session.connection.id,
              name: session.connection.name,
              provider: {
                slug: session.connection.provider,
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
          integrationProviderKey: sessions[0]?.connection.provider || 'uazapi',
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
     * GET /sessions/blacklist
     * Lista contatos na blacklist (bypassBots = true)
     */
    blacklist: igniter.query({
      path: '/blacklist',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
        search: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticacao necessaria');
        }

        const organizationId = user.role === 'admin' ? undefined : user.currentOrgId;

        if (user.role !== 'admin' && !organizationId) {
          return response.forbidden('Organizacao nao encontrada');
        }

        const page = request.query.page ?? 1;
        const limit = request.query.limit ?? 50;
        const search = request.query.search;
        const skip = (page - 1) * limit;

        const where: any = {
          bypassBots: true,
          ...(organizationId && { organizationId }),
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phoneNumber: { contains: search } },
            ],
          }),
        };

        const [contacts, total] = await Promise.all([
          database.contact.findMany({
            where,
            skip,
            take: limit,
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              phoneNumber: true,
              name: true,
              profilePicUrl: true,
              bypassBots: true,
              createdAt: true,
              updatedAt: true,
              _count: {
                select: { chatSessions: true },
              },
            },
          }),
          database.contact.count({ where }),
        ]);

        return response.success({
          data: contacts.map((c) => ({
            ...c,
            sessionsCount: c._count.chatSessions,
          })),
          pagination: {
            total,
            totalPages: Math.ceil(total / limit),
            page,
            limit,
          },
        });
      },
    }),

    /**
     * POST /sessions/contacts/:contactId/blacklist
     * Adicionar contato a blacklist
     */
    addToBlacklist: igniter.mutation({
      path: '/contacts/:contactId/blacklist' as const,
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticacao necessaria');
        }

        const { contactId } = request.params as { contactId: string };

        const contact = await database.contact.findUnique({
          where: { id: contactId },
          select: { id: true, organizationId: true, bypassBots: true },
        });

        if (!contact) {
          return response.notFound('Contato nao encontrado');
        }

        if (user.role !== 'admin' && contact.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        if (contact.bypassBots) {
          return response.badRequest('Contato ja esta na blacklist');
        }

        await sessionsManager.setContactBypassBots(contactId, true);

        return response.success({ message: 'Contato adicionado a blacklist' });
      },
    }),

    /**
     * DELETE /sessions/contacts/:contactId/blacklist
     * Remover contato da blacklist
     */
    removeFromBlacklist: igniter.mutation({
      path: '/contacts/:contactId/blacklist' as const,
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticacao necessaria');
        }

        const { contactId } = request.params as { contactId: string };

        const contact = await database.contact.findUnique({
          where: { id: contactId },
          select: { id: true, organizationId: true, bypassBots: true },
        });

        if (!contact) {
          return response.notFound('Contato nao encontrado');
        }

        if (user.role !== 'admin' && contact.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        if (!contact.bypassBots) {
          return response.badRequest('Contato nao esta na blacklist');
        }

        await sessionsManager.setContactBypassBots(contactId, false);

        return response.success({ message: 'Contato removido da blacklist' });
      },
    }),

    /**
     * PUT /sessions/contacts/:contactId/labels
     * Gerenciar labels/etiquetas do contato (3 modos)
     * Modo 1: labelIds - Substitui TODAS as labels
     * Modo 2: addLabelId - Adiciona UMA label
     * Modo 3: removeLabelId - Remove UMA label
     */
    updateContactLabels: igniter.mutation({
      path: '/contacts/:contactId/labels' as const,
      method: 'PUT',
      body: z.object({
        labelIds: z.array(z.string()).optional(),
        addLabelId: z.string().optional(),
        removeLabelId: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { contactId } = request.params as { contactId: string };
        const { labelIds, addLabelId, removeLabelId } = request.body;

        // Validar que apenas um modo foi usado
        const modesUsed = [labelIds, addLabelId, removeLabelId].filter(Boolean).length;
        if (modesUsed === 0) {
          return response.badRequest('Forneça labelIds, addLabelId ou removeLabelId');
        }
        if (modesUsed > 1) {
          return response.badRequest('Use apenas um modo por requisição: labelIds, addLabelId ou removeLabelId');
        }

        // Verificar se contato existe e pertence à organização
        const contact = await database.contact.findUnique({
          where: { id: contactId },
          select: { id: true, organizationId: true },
        });

        if (!contact) {
          return response.notFound('Contato não encontrado');
        }

        if (user.role !== 'admin' && contact.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        // MODO 1: Substituir todas as labels
        if (labelIds !== undefined) {
          await database.contactTabulation.deleteMany({
            where: { contactId },
          });

          if (labelIds.length > 0) {
            await database.contactTabulation.createMany({
              data: labelIds.map((labelId) => ({
                contactId,
                tabulationId: labelId,
              })),
              skipDuplicates: true,
            });
          }
        }

        // MODO 2: Adicionar uma label
        if (addLabelId) {
          await database.contactTabulation.upsert({
            where: {
              contactId_tabulationId: {
                contactId,
                tabulationId: addLabelId,
              },
            },
            create: {
              contactId,
              tabulationId: addLabelId,
            },
            update: {},
          });
        }

        // MODO 3: Remover uma label
        if (removeLabelId) {
          await database.contactTabulation.deleteMany({
            where: {
              contactId,
              tabulationId: removeLabelId,
            },
          });
        }

        // Buscar tabulations atualizadas
        const updatedContact = await database.contact.findUnique({
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

        const labels = updatedContact?.contactTabulations.map((ct) => ct.tabulation) || [];

        // Emitir evento SSE para sincronização em tempo real
        sseEvents.emitContactLabelsChanged({
          contactId,
          action: labelIds ? 'replaced' : addLabelId ? 'added' : 'removed',
          labelIds: labelIds,
          labelId: addLabelId || removeLabelId,
          organizationId: contact.organizationId || undefined,
        });

        return response.success({
          message: labelIds
            ? `${labelIds.length} etiqueta(s) definida(s)`
            : addLabelId
            ? 'Etiqueta adicionada com sucesso'
            : 'Etiqueta removida com sucesso',
          labels,
          count: labels.length,
        });
      },
    }),

    /**
     * PUT /sessions/:sessionId/labels
     * Gerenciar labels/etiquetas da sessão (3 modos)
     * Modo 1: labelIds - Substitui TODAS as labels
     * Modo 2: addLabelId - Adiciona UMA label
     * Modo 3: removeLabelId - Remove UMA label
     */
    updateSessionLabels: igniter.mutation({
      path: '/:sessionId/labels',
      method: 'PUT',
      body: z.object({
        labelIds: z.array(z.string()).optional(),
        addLabelId: z.string().optional(),
        removeLabelId: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { sessionId } = request.params as { sessionId: string };
        const { labelIds, addLabelId, removeLabelId } = request.body;

        // Validar que apenas um modo foi usado
        const modesUsed = [labelIds, addLabelId, removeLabelId].filter(Boolean).length;
        if (modesUsed === 0) {
          return response.badRequest('Forneça labelIds, addLabelId ou removeLabelId');
        }
        if (modesUsed > 1) {
          return response.badRequest('Use apenas um modo por requisição');
        }

        // Verificar se sessão existe e pertence à organização
        const session = await database.chatSession.findUnique({
          where: { id: sessionId },
          select: { id: true, organizationId: true },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        // MODO 1: Substituir todas as labels
        if (labelIds !== undefined) {
          await database.sessionTabulation.deleteMany({
            where: { sessionId },
          });

          if (labelIds.length > 0) {
            await database.sessionTabulation.createMany({
              data: labelIds.map((labelId) => ({
                sessionId,
                tabulationId: labelId,
              })),
              skipDuplicates: true,
            });
          }
        }

        // MODO 2: Adicionar uma label
        if (addLabelId) {
          await database.sessionTabulation.upsert({
            where: {
              sessionId_tabulationId: {
                sessionId,
                tabulationId: addLabelId,
              },
            },
            create: {
              sessionId,
              tabulationId: addLabelId,
            },
            update: {},
          });
        }

        // MODO 3: Remover uma label
        if (removeLabelId) {
          await database.sessionTabulation.deleteMany({
            where: {
              sessionId,
              tabulationId: removeLabelId,
            },
          });
        }

        // Buscar tabulations atualizadas
        const updatedSession = await database.chatSession.findUnique({
          where: { id: sessionId },
          include: {
            sessionTabulations: {
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

        const labels = updatedSession?.sessionTabulations.map((st) => st.tabulation) || [];

        // Emitir evento SSE para sincronização em tempo real
        sseEvents.emitSessionLabelsChanged({
          sessionId,
          action: labelIds ? 'replaced' : addLabelId ? 'added' : 'removed',
          labelIds: labelIds,
          labelId: addLabelId || removeLabelId,
          organizationId: session.organizationId,
        });

        return response.success({
          message: labelIds
            ? `${labelIds.length} etiqueta(s) definida(s)`
            : addLabelId
            ? 'Etiqueta adicionada com sucesso'
            : 'Etiqueta removida com sucesso',
          labels,
          count: labels.length,
        });
      },
    }),

    /**
     * GET /sessions/tabulations
     * Listar tabulations/etiquetas disponíveis
     */
    listTabulations: igniter.query({
      path: '/tabulations',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const organizationId = user.role === 'admin' ? undefined : user.currentOrgId;

        const tabulations = await database.tabulation.findMany({
          where: {
            ...(organizationId && { organizationId }),
          },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            backgroundColor: true,
          },
        });

        return response.success({
          data: tabulations,
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

        const { status, responseFilter, search } = request.query;
        const page = request.query.page ?? 1;
        const limit = request.query.limit ?? 10;
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
            connection: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                provider: true,
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
                status: { not: 'read' },
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
              sessionIntegrationId: session.connection.id,
              sessionIntegration: {
                id: session.connection.id,
                provider: {
                  id: session.connection.id,
                  name: session.connection.provider,
                  slug: session.connection.provider,
                  icon: 'https://storage.falecomigo.ai/falecomigo.ai/assets/whatsapp.png',
                },
                name: session.connection.name,
                phoneNumber: session.connection.phoneNumber,
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

    /**
     * PATCH /sessions/contacts/:contactId/lead
     * Editar lead/contato completo (inspirado em /chat/editLead)
     * Permite editar todos os campos do contato incluindo os 20 campos personalizados
     */
    updateContactLead: igniter.mutation({
      path: '/contacts/:contactId/lead' as const,
      method: 'PATCH',
      body: z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
        tags: z.array(z.string()).optional(),
        // Custom fields 01-20
        contactField01: z.string().max(255).nullable().optional(),
        contactField02: z.string().max(255).nullable().optional(),
        contactField03: z.string().max(255).nullable().optional(),
        contactField04: z.string().max(255).nullable().optional(),
        contactField05: z.string().max(255).nullable().optional(),
        contactField06: z.string().max(255).nullable().optional(),
        contactField07: z.string().max(255).nullable().optional(),
        contactField08: z.string().max(255).nullable().optional(),
        contactField09: z.string().max(255).nullable().optional(),
        contactField10: z.string().max(255).nullable().optional(),
        contactField11: z.string().max(255).nullable().optional(),
        contactField12: z.string().max(255).nullable().optional(),
        contactField13: z.string().max(255).nullable().optional(),
        contactField14: z.string().max(255).nullable().optional(),
        contactField15: z.string().max(255).nullable().optional(),
        contactField16: z.string().max(255).nullable().optional(),
        contactField17: z.string().max(255).nullable().optional(),
        contactField18: z.string().max(255).nullable().optional(),
        contactField19: z.string().max(255).nullable().optional(),
        contactField20: z.string().max(255).nullable().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { contactId } = request.params as { contactId: string };
        const updateData = request.body;
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        // Verificar se o contato existe
        const contact = await database.contact.findUnique({
          where: { id: contactId },
        });

        if (!contact) {
          return response.notFound('Contato não encontrado');
        }

        // Atualizar contato
        const updated = await database.contact.update({
          where: { id: contactId },
          data: updateData,
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

        // Emitir eventos SSE para campos importantes alterados
        const changedFields = Object.keys(updateData);
        if (changedFields.length > 0) {
          const updateDataRecord = updateData as Record<string, unknown>;
          for (const field of changedFields) {
            if (updateDataRecord[field] !== undefined && updateDataRecord[field] !== (contact as Record<string, unknown>)[field]) {
              sseEvents.emitContactUpdated({
                contactId,
                field,
                oldValue: (contact as Record<string, unknown>)[field],
                newValue: updateDataRecord[field],
                organizationId: contact.organizationId || undefined,
              });
            }
          }
        }

        return response.success({
          message: 'Lead/Contato atualizado com sucesso',
          data: updated,
        });
      },
    }),

    /**
     * PATCH /sessions/:sessionId/lead
     * Editar ticket/sessão (status, atendente, kanban, tags)
     * Inspirado em /chat/editLead para gerenciamento de tickets
     */
    updateSessionLead: igniter.mutation({
      path: '/:sessionId/lead',
      method: 'PATCH',
      body: z.object({
        status: z.enum(['QUEUED', 'ACTIVE', 'PAUSED', 'CLOSED']).optional(),
        assignedAgentId: z.string().nullable().optional(),
        assignedDepartmentId: z.string().nullable().optional(),
        journeyStage: z.string().optional(), // Posição no kanban
        customerJourney: z.string().optional(),
        leadScore: z.number().min(0).max(100).nullable().optional(),
        tags: z.array(z.string()).optional(),
        statusReason: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { sessionId } = request.params as { sessionId: string };
        const updateData = request.body;
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        // Verificar se a sessão existe e pertence à organização do usuário
        const session = await database.chatSession.findUnique({
          where: { id: sessionId },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Sem permissão para editar esta sessão');
        }

        // Atualizar sessão
        const updated = await database.chatSession.update({
          where: { id: sessionId },
          data: {
            ...updateData,
            ...(updateData.status === 'CLOSED' && { closedAt: new Date() }),
          },
          include: {
            contact: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                email: true,
                profilePicUrl: true,
              },
            },
            department: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
            sessionTabulations: {
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

        // Emitir eventos SSE para cada campo alterado
        if (updateData.status) {
          sseEvents.emitSessionUpdated({
            sessionId,
            field: 'status',
            oldValue: session.status,
            newValue: updateData.status,
            organizationId: session.organizationId,
          });
        }

        if (updateData.assignedAgentId !== undefined) {
          sseEvents.emitSessionUpdated({
            sessionId,
            field: 'assignedAgentId',
            oldValue: session.assignedAgentId,
            newValue: updateData.assignedAgentId,
            organizationId: session.organizationId,
          });
        }

        if (updateData.assignedDepartmentId !== undefined) {
          sseEvents.emitSessionUpdated({
            sessionId,
            field: 'assignedDepartmentId',
            oldValue: session.assignedDepartmentId,
            newValue: updateData.assignedDepartmentId,
            organizationId: session.organizationId,
          });
        }

        if (updateData.journeyStage) {
          sseEvents.emitSessionUpdated({
            sessionId,
            field: 'journeyStage',
            oldValue: session.journeyStage,
            newValue: updateData.journeyStage,
            organizationId: session.organizationId,
          });
        }

        return response.success({
          message: 'Ticket/Sessão atualizado com sucesso',
          data: updated,
        });
      },
    }),

    /**
     * POST /sessions/bulk
     * Acoes em massa para multiplas sessoes
     * Suporta: close, pause, resume, enableAI, disableAI
     */
    bulk: igniter.mutation({
      path: '/bulk',
      method: 'POST',
      body: z.object({
        sessionIds: z.array(z.string()).min(1).max(100),
        action: z.enum(['close', 'pause', 'resume', 'enableAI', 'disableAI']),
        pauseHours: z.number().min(1).max(168).optional(), // Para action=pause
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticacao necessaria');
        }

        const { sessionIds, action, pauseHours } = request.body;

        // Verificar permissao para todas as sessoes
        const sessions = await database.chatSession.findMany({
          where: {
            id: { in: sessionIds },
            // Se nao for admin, filtrar pela org do usuario
            ...(user.role !== 'admin' && user.currentOrgId
              ? { organizationId: user.currentOrgId }
              : {}),
          },
          select: { id: true, organizationId: true, status: true, aiEnabled: true },
        });

        if (sessions.length === 0) {
          return response.notFound('Nenhuma sessao encontrada');
        }

        const results: { id: string; success: boolean; error?: string }[] = [];

        for (const session of sessions) {
          try {
            switch (action) {
              case 'close':
                await sessionsManager.updateSessionStatus(session.id, 'CLOSED');
                break;

              case 'pause':
                await sessionsManager.updateSessionStatus(session.id, 'PAUSED');
                if (pauseHours) {
                  await sessionsManager.blockAI(session.id, pauseHours * 60, 'bulk_pause');
                }
                break;

              case 'resume':
                await sessionsManager.updateSessionStatus(session.id, 'ACTIVE');
                await sessionsManager.unblockAI(session.id);
                break;

              case 'enableAI':
                await sessionsManager.unblockAI(session.id);
                break;

              case 'disableAI':
                await sessionsManager.blockAI(session.id, 24 * 60, 'bulk_disable');
                break;
            }

            results.push({ id: session.id, success: true });
          } catch (error: any) {
            results.push({ id: session.id, success: false, error: error.message });
          }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        return response.success({
          message: `Acao '${action}' executada em ${successCount} sessoes${failCount > 0 ? ` (${failCount} falhas)` : ''}`,
          processed: sessions.length,
          success: successCount,
          failed: failCount,
          results,
        });
      },
    }),

    /**
     * DELETE /sessions/:id
     * Deletar uma sessão e todas suas mensagens/notas
     * CUIDADO: Esta ação é irreversível!
     */
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticacao necessaria');
        }

        const { id } = request.params as { id: string };

        // Buscar sessão
        const session = await database.chatSession.findUnique({
          where: { id },
          select: { id: true, organizationId: true },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        // Verificar permissões
        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta sessão');
        }

        // Deletar em cascata (mensagens, notas, etc são deletados via onDelete: Cascade)
        await database.chatSession.delete({
          where: { id },
        });

        return response.success({
          message: 'Sessão deletada com sucesso',
          deletedId: id,
        });
      },
    }),
  },
});
