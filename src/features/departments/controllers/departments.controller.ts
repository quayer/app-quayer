import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';

/**
 * Departments Controller
 *
 * Gerenciamento hierárquico de departamentos para organização de agentes/atendentes
 *
 * Rotas:
 * - GET    /api/departments          - Listar todos os departamentos
 * - POST   /api/departments          - Criar novo departamento
 * - PUT    /api/departments          - Atualizar departamento
 * - GET    /api/departments/:id      - Buscar departamento por ID
 * - DELETE /api/departments/:id      - Deletar departamento
 */
export const departmentsController = igniter.controller({
  name: 'departments',
  description: 'Gerenciamento hierárquico de departamentos',

  actions: {
    /**
     * GET /api/departments
     * Lista todos os departamentos da organização
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(10),
        search: z.string().optional(),
        type: z.enum(['support', 'sales', 'custom']).optional(),
        isActive: z.coerce.boolean().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { page, limit, search, type, isActive } = context.query;
        const { currentOrgId } = context.user;

        const where: any = {
          organizationId: currentOrgId,
        };

        if (search) {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ];
        }

        if (type) {
          where.type = type;
        }

        if (isActive !== undefined) {
          where.isActive = isActive;
        }

        const [departments, total] = await Promise.all([
          database.department.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
              _count: {
                select: {
                  chatSessions: true,
                },
              },
            },
          }),
          database.department.count({ where }),
        ]);

        return response.success({
          data: departments.map((dept) => ({
            id: dept.id,
            name: dept.name,
            slug: dept.slug,
            description: dept.description,
            type: dept.type,
            isActive: dept.isActive,
            createdAt: dept.createdAt,
            updatedAt: dept.updatedAt,
            stats: {
              totalSessions: dept._count.chatSessions,
            },
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
     * POST /api/departments
     * Cria novo departamento
     */
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      body: z.object({
        name: z.string().min(1),
        slug: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(['support', 'sales', 'custom']).default('support'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { name, slug, description, type } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se slug já existe nesta organização
        const existing = await database.department.findFirst({
          where: {
            organizationId: currentOrgId,
            slug,
          },
        });

        if (existing) {
          return response.error({
            message: 'Já existe um departamento com este slug nesta organização',
            status: 400,
          });
        }

        const department = await database.department.create({
          data: {
            organizationId: currentOrgId,
            name,
            slug,
            description,
            type,
          },
        });

        return response.success({
          data: department,
          message: 'Departamento criado com sucesso',
        });
      },
    }),

    /**
     * PUT /api/departments
     * Atualiza departamento existente
     *
     * Note: OpenAPI spec uses PUT without ID in path, likely using ID in body
     */
    update: igniter.mutation({
      path: '/',
      method: 'PUT',
      body: z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        slug: z.string().min(1).optional(),
        description: z.string().optional(),
        type: z.enum(['support', 'sales', 'custom']).optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id, name, slug, description, type } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se departamento existe e pertence à organização
        const existing = await database.department.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!existing) {
          return response.error({
            message: 'Departamento não encontrado',
            status: 404,
          });
        }

        // Se atualizando slug, verificar duplicação
        if (slug && slug !== existing.slug) {
          const duplicate = await database.department.findFirst({
            where: {
              organizationId: currentOrgId,
              slug,
              id: { not: id },
            },
          });

          if (duplicate) {
            return response.error({
              message: 'Já existe um departamento com este slug nesta organização',
              status: 400,
            });
          }
        }

        const department = await database.department.update({
          where: { id },
          data: {
            ...(name && { name }),
            ...(slug && { slug }),
            ...(description !== undefined && { description }),
            ...(type && { type }),
          },
        });

        return response.success({
          data: department,
          message: 'Departamento atualizado com sucesso',
        });
      },
    }),

    /**
     * GET /api/departments/:id
     * Busca departamento por ID
     */
    getById: igniter.query({
      path: '/:departmentId',
      params: z.object({
        departmentId: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { departmentId } = context.params;
        const { currentOrgId } = context.user;

        const department = await database.department.findFirst({
          where: {
            id: departmentId,
            organizationId: currentOrgId,
          },
          include: {
            _count: {
              select: {
                chatSessions: true,
              },
            },
            chatSessions: {
              where: {
                status: { in: ['QUEUED', 'ACTIVE'] },
              },
              select: {
                id: true,
                status: true,
                contact: {
                  select: {
                    id: true,
                    name: true,
                    phoneNumber: true,
                  },
                },
              },
              take: 10,
              orderBy: { updatedAt: 'desc' },
            },
          },
        });

        if (!department) {
          return response.error({
            message: 'Departamento não encontrado',
            status: 404,
          });
        }

        return response.success({
          data: {
            id: department.id,
            name: department.name,
            slug: department.slug,
            description: department.description,
            type: department.type,
            isActive: department.isActive,
            createdAt: department.createdAt,
            updatedAt: department.updatedAt,
            stats: {
              totalSessions: department._count.chatSessions,
              activeSessions: department.chatSessions.length,
            },
            recentSessions: department.chatSessions,
          },
        });
      },
    }),

    /**
     * DELETE /api/departments/:id
     * Deleta departamento
     */
    delete: igniter.mutation({
      path: '/:departmentId',
      method: 'DELETE',
      params: z.object({
        departmentId: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { departmentId } = context.params;
        const { currentOrgId } = context.user;

        // Verificar se departamento existe e pertence à organização
        const department = await database.department.findFirst({
          where: {
            id: departmentId,
            organizationId: currentOrgId,
          },
          include: {
            _count: {
              select: {
                chatSessions: true,
              },
            },
          },
        });

        if (!department) {
          return response.error({
            message: 'Departamento não encontrado',
            status: 404,
          });
        }

        // Verificar se há sessões vinculadas
        if (department._count.chatSessions > 0) {
          return response.error({
            message: `Não é possível deletar o departamento pois existem ${department._count.chatSessions} sessões vinculadas a ele`,
            status: 400,
          });
        }

        await database.department.delete({
          where: { id: departmentId },
        });

        return response.success({
          message: 'Departamento deletado com sucesso',
        });
      },
    }),

    /**
     * PATCH /api/departments/:id/toggle-active
     * Ativa/desativa departamento
     */
    toggleActive: igniter.mutation({
      path: '/:departmentId/toggle-active',
      method: 'PATCH',
      params: z.object({
        departmentId: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { departmentId } = context.params;
        const { currentOrgId } = context.user;

        const department = await database.department.findFirst({
          where: {
            id: departmentId,
            organizationId: currentOrgId,
          },
        });

        if (!department) {
          return response.error({
            message: 'Departamento não encontrado',
            status: 404,
          });
        }

        const updated = await database.department.update({
          where: { id: departmentId },
          data: {
            isActive: !department.isActive,
          },
        });

        return response.success({
          data: updated,
          message: `Departamento ${updated.isActive ? 'ativado' : 'desativado'} com sucesso`,
        });
      },
    }),
  },
});
