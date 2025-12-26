/**
 * Quick Replies Controller
 * CRUD para respostas rápidas (canned responses)
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { database } from '@/services/database';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';

export const quickRepliesController = igniter.controller({
  name: 'quick-replies',
  path: '/quick-replies',
  description: 'Gerenciamento de respostas rápidas',

  actions: {
    /**
     * POST /quick-replies
     * Criar nova resposta rápida
     */
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      body: z.object({
        shortcut: z.string()
          .min(2, 'Atalho muito curto')
          .max(20, 'Atalho muito longo')
          .regex(/^\/[a-z0-9_]+$/, 'Atalho deve começar com / e conter apenas letras minúsculas, números e _'),
        title: z.string().min(1, 'Título obrigatório').max(100),
        content: z.string().min(1, 'Conteúdo obrigatório').max(4000),
        category: z.string().max(50).optional(),
        isGlobal: z.boolean().optional().default(true),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user || !user.currentOrgId) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { shortcut, title, content, category, isGlobal } = request.body;

        // Check if shortcut already exists
        const existing = await database.quickReply.findUnique({
          where: {
            organizationId_shortcut: {
              organizationId: user.currentOrgId,
              shortcut,
            },
          },
        });

        if (existing) {
          return response.badRequest(`Atalho "${shortcut}" já existe`);
        }

        const quickReply = await database.quickReply.create({
          data: {
            organizationId: user.currentOrgId,
            createdById: user.id,
            shortcut,
            title,
            content,
            category,
            isGlobal,
          },
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        return response.success(quickReply);
      },
    }),

    /**
     * GET /quick-replies
     * Listar respostas rápidas da organização
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        category: z.string().optional(),
        search: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).optional().default(50),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user || !user.currentOrgId) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { category, search, limit } = request.query;

        const where: any = {
          organizationId: user.currentOrgId,
          isActive: true,
          OR: [
            { isGlobal: true },
            { createdById: user.id },
          ],
        };

        if (category) {
          where.category = category;
        }

        if (search) {
          where.AND = [
            {
              OR: [
                { shortcut: { contains: search, mode: 'insensitive' } },
                { title: { contains: search, mode: 'insensitive' } },
                { content: { contains: search, mode: 'insensitive' } },
              ],
            },
          ];
        }

        const quickReplies = await database.quickReply.findMany({
          where,
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: [
            { usageCount: 'desc' },
            { title: 'asc' },
          ],
          take: limit,
        });

        // Get categories for filtering
        const categories = await database.quickReply.findMany({
          where: {
            organizationId: user.currentOrgId,
            isActive: true,
            category: { not: null },
          },
          select: { category: true },
          distinct: ['category'],
        });

        return response.success({
          quickReplies,
          categories: categories.map(c => c.category).filter(Boolean),
        });
      },
    }),

    /**
     * GET /quick-replies/:id
     * Buscar resposta rápida por ID
     */
    get: igniter.query({
      path: '/:id',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user || !user.currentOrgId) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params as { id: string };

        const quickReply = await database.quickReply.findFirst({
          where: {
            id,
            organizationId: user.currentOrgId,
          },
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        if (!quickReply) {
          return response.notFound('Resposta rápida não encontrada');
        }

        return response.success(quickReply);
      },
    }),

    /**
     * PATCH /quick-replies/:id
     * Atualizar resposta rápida
     */
    update: igniter.mutation({
      path: '/:id',
      method: 'PATCH',
      body: z.object({
        shortcut: z.string()
          .min(2)
          .max(20)
          .regex(/^\/[a-z0-9_]+$/)
          .optional(),
        title: z.string().min(1).max(100).optional(),
        content: z.string().min(1).max(4000).optional(),
        category: z.string().max(50).nullable().optional(),
        isGlobal: z.boolean().optional(),
        isActive: z.boolean().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user || !user.currentOrgId) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params as { id: string };
        const updates = request.body;

        // Find existing
        const existing = await database.quickReply.findFirst({
          where: {
            id,
            organizationId: user.currentOrgId,
          },
        });

        if (!existing) {
          return response.notFound('Resposta rápida não encontrada');
        }

        // Only creator or admin can edit
        if (user.role !== 'admin' && existing.createdById !== user.id) {
          return response.forbidden('Apenas o criador pode editar');
        }

        // Check shortcut uniqueness if changing
        if (updates.shortcut && updates.shortcut !== existing.shortcut) {
          const duplicate = await database.quickReply.findUnique({
            where: {
              organizationId_shortcut: {
                organizationId: user.currentOrgId,
                shortcut: updates.shortcut,
              },
            },
          });

          if (duplicate) {
            return response.badRequest(`Atalho "${updates.shortcut}" já existe`);
          }
        }

        const quickReply = await database.quickReply.update({
          where: { id },
          data: updates,
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        return response.success(quickReply);
      },
    }),

    /**
     * DELETE /quick-replies/:id
     * Deletar resposta rápida
     */
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user || !user.currentOrgId) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params as { id: string };

        const existing = await database.quickReply.findFirst({
          where: {
            id,
            organizationId: user.currentOrgId,
          },
        });

        if (!existing) {
          return response.notFound('Resposta rápida não encontrada');
        }

        // Only creator or admin can delete
        if (user.role !== 'admin' && existing.createdById !== user.id) {
          return response.forbidden('Apenas o criador pode deletar');
        }

        await database.quickReply.delete({ where: { id } });

        return response.success({ message: 'Resposta rápida deletada' });
      },
    }),

    /**
     * POST /quick-replies/:id/use
     * Registrar uso de resposta rápida (incrementa contador)
     */
    use: igniter.mutation({
      path: '/:id/use',
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user || !user.currentOrgId) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params as { id: string };

        const quickReply = await database.quickReply.update({
          where: { id },
          data: {
            usageCount: { increment: 1 },
          },
        });

        return response.success({ usageCount: quickReply.usageCount });
      },
    }),

    /**
     * GET /quick-replies/by-shortcut/:shortcut
     * Buscar resposta rápida pelo atalho
     */
    byShortcut: igniter.query({
      path: '/by-shortcut/:shortcut',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user || !user.currentOrgId) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { shortcut } = request.params as { shortcut: string };
        const normalizedShortcut = shortcut.startsWith('/') ? shortcut : `/${shortcut}`;

        const quickReply = await database.quickReply.findUnique({
          where: {
            organizationId_shortcut: {
              organizationId: user.currentOrgId,
              shortcut: normalizedShortcut,
            },
          },
        });

        if (!quickReply || !quickReply.isActive) {
          return response.notFound('Atalho não encontrado');
        }

        // Check visibility
        if (!quickReply.isGlobal && quickReply.createdById !== user.id) {
          return response.notFound('Atalho não encontrado');
        }

        return response.success(quickReply);
      },
    }),
  },
});
