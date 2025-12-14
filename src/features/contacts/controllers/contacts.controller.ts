import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';

/**
 * Contacts Controller
 *
 * Gerenciamento de contatos do sistema
 * Contatos são criados automaticamente a partir de interações WhatsApp
 *
 * Rotas:
 * - GET    /api/contacts                - Listar contatos
 * - GET    /api/contacts/:id            - Buscar por ID
 * - PUT    /api/contacts/:id            - Atualizar contato
 * - DELETE /api/contacts/:id            - Deletar contato
 * - GET    /api/contacts/:id/sessions   - Histórico de sessões do contato
 */
export const contactsController = igniter.controller({
  name: 'contacts',
  path: '/contacts',
  description: 'Gerenciamento de contatos',

  actions: {
    /**
     * GET /api/contacts
     * Listar contatos com filtros e paginação
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
        search: z.string().optional(),
        tag: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { page = 1, limit = 50, search, tag } = request.query;
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        // Admin pode ver todos os contatos, outros usuários veem apenas da sua org
        const organizationId = user.role === 'admin' ? undefined : user.currentOrgId;

        const where: any = {};

        // Filtrar por organização se não for admin
        if (organizationId) {
          where.organizationId = organizationId;
        }

        // Busca por nome, telefone ou email
        if (search) {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { phoneNumber: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ];
        }

        // Filtrar por tag
        if (tag) {
          where.tags = { has: tag };
        }

        const [contacts, total] = await Promise.all([
          database.contact.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { updatedAt: 'desc' },
            include: {
              // Incluir última sessão para mostrar última interação
              chatSessions: {
                take: 1,
                orderBy: { updatedAt: 'desc' },
                select: {
                  id: true,
                  status: true,
                  updatedAt: true,
                  organization: {
                    select: { id: true, name: true },
                  },
                },
              },
            },
          }),
          database.contact.count({ where }),
        ]);

        // Formatar resposta com última interação
        const formattedContacts = contacts.map((contact) => ({
          ...contact,
          lastInteractionAt: contact.chatSessions[0]?.updatedAt || contact.updatedAt,
          lastSessionStatus: contact.chatSessions[0]?.status || null,
          organizationName: contact.chatSessions[0]?.organization?.name || null,
        }));

        return response.success({
          data: formattedContacts,
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
     * GET /api/contacts/:id
     * Buscar contato por ID
     */
    getById: igniter.query({
      path: '/:id',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = request.params as { id: string };
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const contact = await database.contact.findUnique({
          where: { id },
          include: {
            chatSessions: {
              take: 10,
              orderBy: { updatedAt: 'desc' },
              select: {
                id: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                organization: {
                  select: { id: true, name: true },
                },
              },
            },
            contactAttributes: {
              include: {
                attribute: true,
              },
            },
            contactObservations: {
              take: 10,
              orderBy: { createdAt: 'desc' },
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        });

        if (!contact) {
          return response.notFound('Contato não encontrado');
        }

        // Verificar permissão (admin pode ver qualquer contato)
        if (user.role !== 'admin' && contact.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a este contato');
        }

        return response.success({
          data: contact,
        });
      },
    }),

    /**
     * PUT /api/contacts/:id
     * Atualizar contato
     */
    update: igniter.mutation({
      path: '/:id',
      method: 'PUT',
      body: z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
        tags: z.array(z.string()).optional(),
        bypassBots: z.boolean().optional(),
        customFields: z.record(z.any()).optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = request.params as { id: string };
        const { name, email, tags, bypassBots, customFields } = request.body;
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        // Verificar se contato existe
        const existing = await database.contact.findUnique({
          where: { id },
        });

        if (!existing) {
          return response.notFound('Contato não encontrado');
        }

        // Verificar permissão
        if (user.role !== 'admin' && existing.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a este contato');
        }

        const contact = await database.contact.update({
          where: { id },
          data: {
            ...(name !== undefined && { name }),
            ...(email !== undefined && { email }),
            ...(tags !== undefined && { tags }),
            ...(bypassBots !== undefined && { bypassBots }),
            ...(customFields !== undefined && { customFields }),
          },
        });

        return response.success({
          data: contact,
          message: 'Contato atualizado com sucesso',
        });
      },
    }),

    /**
     * DELETE /api/contacts/:id
     * Deletar contato
     */
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = request.params as { id: string };
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const contact = await database.contact.findUnique({
          where: { id },
        });

        if (!contact) {
          return response.notFound('Contato não encontrado');
        }

        // Verificar permissão
        if (user.role !== 'admin' && contact.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a este contato');
        }

        await database.contact.delete({
          where: { id },
        });

        return response.success({
          message: 'Contato deletado com sucesso',
        });
      },
    }),

    /**
     * GET /api/contacts/:id/sessions
     * Histórico de sessões do contato
     */
    getSessions: igniter.query({
      path: '/:id/sessions',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(50).default(20),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = request.params as { id: string };
        const { page = 1, limit = 20 } = request.query;
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        // Verificar se contato existe
        const contact = await database.contact.findUnique({
          where: { id },
        });

        if (!contact) {
          return response.notFound('Contato não encontrado');
        }

        // Verificar permissão
        if (user.role !== 'admin' && contact.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        const [sessions, total] = await Promise.all([
          database.chatSession.findMany({
            where: { contactId: id },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { updatedAt: 'desc' },
            include: {
              organization: {
                select: { id: true, name: true },
              },
              connection: {
                select: { id: true, name: true, phoneNumber: true },
              },
              _count: {
                select: { messages: true },
              },
            },
          }),
          database.chatSession.count({ where: { contactId: id } }),
        ]);

        return response.success({
          data: sessions,
          pagination: {
            total,
            totalPages: Math.ceil(total / limit),
            page,
            limit,
          },
        });
      },
    }),
  },
});
