import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';

/**
 * Labels Controller
 *
 * Sistema de categorização com labels (diferente de Tabulations)
 * Labels são usadas para organização categórica adicional
 *
 * Rotas:
 * - POST   /api/labels                       - Criar label
 * - GET    /api/labels                       - Listar labels
 * - GET    /api/labels/:id                   - Buscar por ID
 * - PUT    /api/labels/:id                   - Atualizar label
 * - DELETE /api/labels/:id                   - Deletar label
 * - GET    /api/labels/:id/stats             - Estatísticas de uso
 * - PATCH  /api/labels/:id/toggle-active     - Toggle status
 * - GET    /api/labels/by-category/:category - Listar por categoria
 */
export const labelsController = igniter.controller({
  name: 'labels',
  description: 'Sistema de categorização com labels',

  actions: {
    /**
     * POST /api/labels
     * Criar nova label
     */
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      body: z.object({
        name: z.string().min(1),
        slug: z.string().min(1),
        description: z.string().optional(),
        backgroundColor: z.string().default('#ffffff'),
        icon: z.string().optional(),
        category: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { name, slug, description, backgroundColor, icon, category } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se slug já existe nesta organização
        const existing = await database.label.findFirst({
          where: {
            organizationId: currentOrgId,
            slug,
          },
        });

        if (existing) {
          return response.error({
            message: 'Já existe uma label com este slug nesta organização',
            status: 400,
          });
        }

        const label = await database.label.create({
          data: {
            organizationId: currentOrgId,
            name,
            slug,
            description,
            backgroundColor,
            icon,
            category,
          },
        });

        return response.success({
          data: label,
          message: 'Label criada com sucesso',
        });
      },
    }),

    /**
     * GET /api/labels
     * Listar todas as labels
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
        category: z.string().optional(),
        isActive: z.coerce.boolean().optional(),
        search: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { page, limit, category, isActive, search } = context.query;
        const { currentOrgId } = context.user;

        const where: any = {
          organizationId: currentOrgId,
        };

        if (category) {
          where.category = category;
        }

        if (isActive !== undefined) {
          where.isActive = isActive;
        }

        if (search) {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ];
        }

        const [labels, total] = await Promise.all([
          database.label.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
          }),
          database.label.count({ where }),
        ]);

        return response.success({
          data: labels,
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
     * GET /api/labels/:id
     * Buscar label por ID
     */
    getById: igniter.query({
      path: '/:id',
      params: z.object({
        id: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { currentOrgId } = context.user;

        const label = await database.label.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!label) {
          return response.error({
            message: 'Label não encontrada',
            status: 404,
          });
        }

        return response.success({
          data: label,
        });
      },
    }),

    /**
     * PUT /api/labels/:id
     * Atualizar label
     */
    update: igniter.mutation({
      path: '/:id',
      method: 'PUT',
      params: z.object({
        id: z.string().uuid(),
      }),
      body: z.object({
        name: z.string().min(1).optional(),
        slug: z.string().min(1).optional(),
        description: z.string().optional(),
        backgroundColor: z.string().optional(),
        icon: z.string().optional(),
        category: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { name, slug, description, backgroundColor, icon, category } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se label existe
        const existing = await database.label.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!existing) {
          return response.error({
            message: 'Label não encontrada',
            status: 404,
          });
        }

        // Se atualizando slug, verificar duplicação
        if (slug && slug !== existing.slug) {
          const duplicate = await database.label.findFirst({
            where: {
              organizationId: currentOrgId,
              slug,
              id: { not: id },
            },
          });

          if (duplicate) {
            return response.error({
              message: 'Já existe uma label com este slug nesta organização',
              status: 400,
            });
          }
        }

        const label = await database.label.update({
          where: { id },
          data: {
            ...(name && { name }),
            ...(slug && { slug }),
            ...(description !== undefined && { description }),
            ...(backgroundColor && { backgroundColor }),
            ...(icon !== undefined && { icon }),
            ...(category !== undefined && { category }),
          },
        });

        return response.success({
          data: label,
          message: 'Label atualizada com sucesso',
        });
      },
    }),

    /**
     * DELETE /api/labels/:id
     * Deletar label
     */
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      params: z.object({
        id: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { currentOrgId } = context.user;

        const label = await database.label.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!label) {
          return response.error({
            message: 'Label não encontrada',
            status: 404,
          });
        }

        await database.label.delete({
          where: { id },
        });

        return response.success({
          message: 'Label deletada com sucesso',
        });
      },
    }),

    /**
     * GET /api/labels/:id/stats
     * Estatísticas de uso da label
     */
    getStats: igniter.query({
      path: '/:id/stats',
      params: z.object({
        id: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { currentOrgId } = context.user;

        const label = await database.label.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!label) {
          return response.error({
            message: 'Label não encontrada',
            status: 404,
          });
        }

        // Aqui você pode adicionar queries para contar onde a label é usada
        // Por exemplo, em tabulations, contacts, etc.
        const stats = {
          id: label.id,
          name: label.name,
          usage: {
            // Adicione aqui contagens reais quando houver relações
            totalUsage: 0,
            lastUsedAt: null,
          },
          createdAt: label.createdAt,
          updatedAt: label.updatedAt,
        };

        return response.success({
          data: stats,
        });
      },
    }),

    /**
     * PATCH /api/labels/:id/toggle-active
     * Ativar/desativar label
     */
    toggleActive: igniter.mutation({
      path: '/:id/toggle-active',
      method: 'PATCH',
      params: z.object({
        id: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { currentOrgId } = context.user;

        const label = await database.label.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!label) {
          return response.error({
            message: 'Label não encontrada',
            status: 404,
          });
        }

        const updated = await database.label.update({
          where: { id },
          data: {
            isActive: !label.isActive,
          },
        });

        return response.success({
          data: updated,
          message: `Label ${updated.isActive ? 'ativada' : 'desativada'} com sucesso`,
        });
      },
    }),

    /**
     * GET /api/labels/by-category/:category
     * Listar labels por categoria
     */
    getByCategory: igniter.query({
      path: '/by-category/:category',
      params: z.object({
        category: z.string(),
      }),
      query: z.object({
        isActive: z.coerce.boolean().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { category } = context.params;
        const { isActive } = context.query;
        const { currentOrgId } = context.user;

        const where: any = {
          organizationId: currentOrgId,
          category,
        };

        if (isActive !== undefined) {
          where.isActive = isActive;
        }

        const labels = await database.label.findMany({
          where,
          orderBy: { name: 'asc' },
        });

        return response.success({
          data: labels,
        });
      },
    }),
  },
});
