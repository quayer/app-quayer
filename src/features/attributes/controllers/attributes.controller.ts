import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';

/**
 * Attributes Controller
 *
 * Gerenciamento de definições de atributos customizados para contatos
 *
 * Rotas:
 * - POST   /api/attribute      - Criar novo atributo
 * - GET    /api/attribute      - Listar atributos
 * - GET    /api/attribute/:id  - Buscar atributo por ID
 * - PUT    /api/attribute/:id  - Atualizar atributo
 * - DELETE /api/attribute/:id  - Deletar atributo
 */
export const attributesController = igniter.controller({
  name: 'attribute',
  description: 'Gerenciamento de definições de atributos customizados',

  actions: {
    /**
     * POST /api/attribute
     * Cria nova definição de atributo
     */
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      body: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(['TEXT', 'DATE', 'DATETIME', 'INTEGER', 'FLOAT', 'DOCUMENT']),
        isRequired: z.boolean().default(false),
        defaultValue: z.string().optional(),
        options: z.array(z.string()).optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { name, description, type, isRequired, defaultValue, options } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se já existe atributo com mesmo nome nesta organização
        const existing = await database.attribute.findFirst({
          where: {
            organizationId: currentOrgId,
            name,
          },
        });

        if (existing) {
          return response.error({
            message: 'Já existe um atributo com este nome nesta organização',
            status: 400,
          });
        }

        const attribute = await database.attribute.create({
          data: {
            organizationId: currentOrgId,
            name,
            description,
            type,
            isRequired,
            defaultValue,
            options: options ? options : undefined,
          },
        });

        return response.success({
          data: attribute,
          message: 'Atributo criado com sucesso',
        });
      },
    }),

    /**
     * GET /api/attribute
     * Lista todos os atributos da organização
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
        type: z.enum(['TEXT', 'DATE', 'DATETIME', 'INTEGER', 'FLOAT', 'DOCUMENT']).optional(),
        isActive: z.coerce.boolean().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { page, limit, type, isActive } = context.query;
        const { currentOrgId } = context.user;

        const where: any = {
          organizationId: currentOrgId,
        };

        if (type) {
          where.type = type;
        }

        if (isActive !== undefined) {
          where.isActive = isActive;
        }

        const [attributes, total] = await Promise.all([
          database.attribute.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
              _count: {
                select: {
                  contactAttributes: true,
                },
              },
            },
          }),
          database.attribute.count({ where }),
        ]);

        return response.success({
          data: attributes.map((attr) => ({
            id: attr.id,
            name: attr.name,
            description: attr.description,
            type: attr.type,
            isRequired: attr.isRequired,
            defaultValue: attr.defaultValue,
            options: attr.options,
            isActive: attr.isActive,
            createdAt: attr.createdAt,
            updatedAt: attr.updatedAt,
            usageCount: attr._count.contactAttributes,
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
     * GET /api/attribute/:id
     * Busca atributo por ID
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

        const attribute = await database.attribute.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
          include: {
            _count: {
              select: {
                contactAttributes: true,
              },
            },
          },
        });

        if (!attribute) {
          return response.error({
            message: 'Atributo não encontrado',
            status: 404,
          });
        }

        return response.success({
          data: {
            id: attribute.id,
            name: attribute.name,
            description: attribute.description,
            type: attribute.type,
            isRequired: attribute.isRequired,
            defaultValue: attribute.defaultValue,
            options: attribute.options,
            isActive: attribute.isActive,
            createdAt: attribute.createdAt,
            updatedAt: attribute.updatedAt,
            usageCount: attribute._count.contactAttributes,
          },
        });
      },
    }),

    /**
     * PUT /api/attribute/:id
     * Atualiza atributo existente
     */
    update: igniter.mutation({
      path: '/:id',
      method: 'PUT',
      params: z.object({
        id: z.string().uuid(),
      }),
      body: z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        type: z.enum(['TEXT', 'DATE', 'DATETIME', 'INTEGER', 'FLOAT', 'DOCUMENT']).optional(),
        isRequired: z.boolean().optional(),
        defaultValue: z.string().optional(),
        options: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const updateData = context.body;
        const { currentOrgId } = context.user;

        // Verificar se atributo existe e pertence à organização
        const existingAttribute = await database.attribute.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!existingAttribute) {
          return response.error({
            message: 'Atributo não encontrado',
            status: 404,
          });
        }

        // Se está tentando mudar o nome, verificar se não existe outro com o mesmo nome
        if (updateData.name && updateData.name !== existingAttribute.name) {
          const duplicateName = await database.attribute.findFirst({
            where: {
              organizationId: currentOrgId,
              name: updateData.name,
              id: { not: id },
            },
          });

          if (duplicateName) {
            return response.error({
              message: 'Já existe um atributo com este nome nesta organização',
              status: 400,
            });
          }
        }

        const attribute = await database.attribute.update({
          where: { id },
          data: updateData,
          include: {
            _count: {
              select: {
                contactAttributes: true,
              },
            },
          },
        });

        return response.success({
          data: {
            id: attribute.id,
            name: attribute.name,
            description: attribute.description,
            type: attribute.type,
            isRequired: attribute.isRequired,
            defaultValue: attribute.defaultValue,
            options: attribute.options,
            isActive: attribute.isActive,
            createdAt: attribute.createdAt,
            updatedAt: attribute.updatedAt,
            usageCount: attribute._count.contactAttributes,
          },
          message: 'Atributo atualizado com sucesso',
        });
      },
    }),

    /**
     * DELETE /api/attribute/:id
     * Deleta atributo (soft delete - marca como inativo)
     */
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      params: z.object({
        id: z.string().uuid(),
      }),
      query: z.object({
        force: z.coerce.boolean().default(false),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { force } = context.query;
        const { currentOrgId } = context.user;

        // Verificar se atributo existe e pertence à organização
        const existingAttribute = await database.attribute.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
          include: {
            _count: {
              select: {
                contactAttributes: true,
              },
            },
          },
        });

        if (!existingAttribute) {
          return response.error({
            message: 'Atributo não encontrado',
            status: 404,
          });
        }

        // Verificar se há contatos usando este atributo
        if (existingAttribute._count.contactAttributes > 0 && !force) {
          return response.error({
            message: `Este atributo está sendo usado por ${existingAttribute._count.contactAttributes} contato(s). Use ?force=true para deletar mesmo assim (os valores serão removidos).`,
            status: 400,
          });
        }

        if (force && existingAttribute._count.contactAttributes > 0) {
          // Deletar todos os valores de atributos dos contatos
          await database.contactAttribute.deleteMany({
            where: { attributeId: id },
          });
        }

        // Soft delete - marcar como inativo ao invés de deletar
        await database.attribute.update({
          where: { id },
          data: { isActive: false },
        });

        return response.success({
          message: force
            ? `Atributo deletado com sucesso (${existingAttribute._count.contactAttributes} valores removidos)`
            : 'Atributo marcado como inativo com sucesso',
        });
      },
    }),
  },
});
