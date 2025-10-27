/**
 * Contacts Controller
 * ⭐ CRÍTICO - Inspirado em falecomigo.ai
 *
 * Gerenciamento completo de contatos (CRM)
 * - CRUD de contatos
 * - Tabulações (tags/categorias)
 * - Observações
 * - Busca por telefone
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';

export const contactsController = igniter.controller({
  name: 'contacts',
  description: 'Gerenciamento de contatos do sistema',

  actions: {
    /**
     * GET /contacts
     * Lista todos os contatos da organização com paginação
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(10),
        search: z.string().optional(), // Buscar por nome ou telefone
        tabulationId: z.string().uuid().optional(), // Filtrar por tabulação
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { page, limit, search, tabulationId } = context.query;
        const { currentOrgId } = context.user;

        const skip = (page - 1) * limit;

        // Construir filtros
        const where: any = {
          organizationId: currentOrgId,
        };

        if (search) {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { phoneNumber: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
          ];
        }

        if (tabulationId) {
          where.contactTabulations = {
            some: {
              tabulationId,
            },
          };
        }

        // Buscar contatos com relacionamentos
        const [contacts, total] = await Promise.all([
          database.contact.findMany({
            where,
            skip,
            take: limit,
            orderBy: { updatedAt: 'desc' },
            include: {
              contactTabulations: {
                include: {
                  tabulation: true,
                },
              },
              chatSessions: {
                where: { status: { in: ['QUEUED', 'ACTIVE'] } },
                select: { id: true, status: true },
              },
              _count: {
                select: {
                  chatSessions: true,
                  messages: true,
                },
              },
            },
          }),
          database.contact.count({ where }),
        ]);

        return response.success({
          data: contacts.map((contact) => ({
            id: contact.id,
            name: contact.name,
            phoneNumber: contact.phoneNumber,
            email: contact.email,
            profilePicture: contact.profilePicUrl,
            isBotMuted: contact.bypassBots,
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt,
            tabulations: contact.contactTabulations.map((ct) => ct.tabulation),
            activeSessions: contact.chatSessions.length,
            totalSessions: contact._count.chatSessions,
            totalMessages: contact._count.messages,
          })),
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
     * GET /contacts/:id
     * Buscar contato por ID com todos os detalhes
     */
    getById: igniter.query({
      path: '/:id',
      params: z.object({
        id: z.string().uuid('ID do contato inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { currentOrgId } = context.user;

        const contact = await database.contact.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
          include: {
            contactTabulations: {
              include: {
                tabulation: true,
              },
            },
            chatSessions: {
              orderBy: { updatedAt: 'desc' },
              take: 10,
              include: {
                instance: {
                  select: {
                    id: true,
                    name: true,
                    phoneNumber: true,
                  },
                },
              },
            },
            _count: {
              select: {
                chatSessions: true,
                messages: true,
              },
            },
          },
        });

        if (!contact) {
          return response.notFound({
            message: 'Contato não encontrado',
          });
        }

        return response.success({
          id: contact.id,
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          email: contact.email,
          profilePicture: contact.profilePicUrl,
          isBotMuted: contact.bypassBots,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
          tabulations: contact.contactTabulations.map((ct) => ct.tabulation),
          recentSessions: contact.chatSessions,
          totalSessions: contact._count.chatSessions,
          totalMessages: contact._count.messages,
        });
      },
    }),

    /**
     * GET /contacts/by-phone/:phone
     * Buscar contato por número de telefone
     */
    getByPhone: igniter.query({
      path: '/by-phone/:phone',
      params: z.object({
        phone: z.string().min(10, 'Número de telefone inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { phone } = context.params;
        const { currentOrgId } = context.user;

        // Normalizar telefone (remover caracteres especiais)
        const normalizedPhone = phone.replace(/\D/g, '');

        const contact = await database.contact.findFirst({
          where: {
            phoneNumber: normalizedPhone,
            organizationId: currentOrgId,
          },
          include: {
            contactTabulations: {
              include: {
                tabulation: true,
              },
            },
            _count: {
              select: {
                chatSessions: true,
                messages: true,
              },
            },
          },
        });

        if (!contact) {
          return response.notFound({
            message: 'Contato não encontrado',
          });
        }

        return response.success({
          id: contact.id,
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          email: contact.email,
          profilePicture: contact.profilePicUrl,
          isBotMuted: contact.bypassBots,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
          tabulations: contact.contactTabulations.map((ct) => ct.tabulation),
          totalSessions: contact._count.chatSessions,
          totalMessages: contact._count.messages,
        });
      },
    }),

    /**
     * PATCH /contacts/:id
     * Atualizar informações do contato
     */
    update: igniter.mutation({
      path: '/:id',
      params: z.object({
        id: z.string().uuid('ID do contato inválido'),
      }),
      body: z.object({
        name: z.string().min(1).optional(),
        email: z.string().email().optional().nullable(),
        profilePicUrl: z.string().url().optional().nullable(),
        bypassBots: z.boolean().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { currentOrgId } = context.user;
        const data = context.body;

        // Verificar se contato existe e pertence à organização
        const contact = await database.contact.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!contact) {
          return response.notFound({
            message: 'Contato não encontrado',
          });
        }

        // Atualizar contato
        const updated = await database.contact.update({
          where: { id },
          data,
          include: {
            contactTabulations: {
              include: {
                tabulation: true,
              },
            },
          },
        });

        return response.success({
          id: updated.id,
          name: updated.name,
          phoneNumber: updated.phoneNumber,
          email: updated.email,
          profilePicture: updated.profilePicUrl,
          isBotMuted: updated.bypassBots,
          updatedAt: updated.updatedAt,
          tabulations: updated.contactTabulations.map((ct) => ct.tabulation),
        });
      },
    }),

    /**
     * POST /contacts/:id/tabulations
     * Adicionar tabulações (tags) ao contato
     */
    addTabulations: igniter.mutation({
      path: '/:id/tabulations',
      params: z.object({
        id: z.string().uuid('ID do contato inválido'),
      }),
      body: z.object({
        tabulationIds: z.array(z.string().uuid()).min(1, 'Informe pelo menos uma tabulação'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { tabulationIds } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se contato existe
        const contact = await database.contact.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!contact) {
          return response.notFound({
            message: 'Contato não encontrado',
          });
        }

        // Verificar se tabulações existem e pertencem à organização
        const tabulations = await database.tabulation.findMany({
          where: {
            id: { in: tabulationIds },
            organizationId: currentOrgId,
          },
        });

        if (tabulations.length !== tabulationIds.length) {
          return response.badRequest({
            message: 'Uma ou mais tabulações não foram encontradas',
          });
        }

        // Adicionar tabulações (createMany ignora duplicatas)
        await database.contactTabulation.createMany({
          data: tabulationIds.map((tabulationId) => ({
            contactId: id,
            tabulationId,
          })),
          skipDuplicates: true,
        });

        // Retornar contato atualizado
        const updated = await database.contact.findUnique({
          where: { id },
          include: {
            contactTabulations: {
              include: {
                tabulation: true,
              },
            },
          },
        });

        return response.success({
          id: updated!.id,
          tabulations: updated!.contactTabulations.map((ct) => ct.tabulation),
        });
      },
    }),

    /**
     * DELETE /contacts/:id/tabulations
     * Remover tabulações (tags) do contato
     */
    removeTabulations: igniter.mutation({
      path: '/:id/tabulations',
      params: z.object({
        id: z.string().uuid('ID do contato inválido'),
      }),
      body: z.object({
        tabulationIds: z.array(z.string().uuid()).min(1, 'Informe pelo menos uma tabulação'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { tabulationIds } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se contato existe
        const contact = await database.contact.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!contact) {
          return response.notFound({
            message: 'Contato não encontrado',
          });
        }

        // Remover tabulações
        await database.contactTabulation.deleteMany({
          where: {
            contactId: id,
            tabulationId: { in: tabulationIds },
          },
        });

        // Retornar contato atualizado
        const updated = await database.contact.findUnique({
          where: { id },
          include: {
            contactTabulations: {
              include: {
                tabulation: true,
              },
            },
          },
        });

        return response.success({
          id: updated!.id,
          tabulations: updated!.contactTabulations.map((ct) => ct.tabulation),
        });
      },
    }),
  },
});
