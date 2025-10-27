import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';

/**
 * Contact Attribute Controller
 *
 * Gerenciamento de valores de atributos para contatos específicos
 *
 * Rotas:
 * - GET    /api/contact-attribute                 - Listar todos os valores de atributos
 * - POST   /api/contact-attribute                 - Criar/atualizar valor de atributo para contato
 * - GET    /api/contact-attribute/contact/:contactId - Buscar atributos de um contato específico
 * - PUT    /api/contact-attribute/:id             - Atualizar valor de atributo
 * - DELETE /api/contact-attribute/:id             - Deletar valor de atributo
 */
export const contactAttributeController = igniter.controller({
  name: 'contact-attribute',
  description: 'Gerenciamento de valores de atributos para contatos',

  actions: {
    /**
     * GET /api/contact-attribute
     * Lista todos os valores de atributos
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
        contactId: z.string().uuid().optional(),
        attributeId: z.string().uuid().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { page, limit, contactId, attributeId } = context.query;
        const { currentOrgId } = context.user;

        const where: any = {
          contact: {
            organizationId: currentOrgId,
          },
        };

        if (contactId) {
          where.contactId = contactId;
        }

        if (attributeId) {
          where.attributeId = attributeId;
        }

        const [contactAttributes, total] = await Promise.all([
          database.contactAttribute.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { updatedAt: 'desc' },
            include: {
              contact: {
                select: {
                  id: true,
                  name: true,
                  phoneNumber: true,
                },
              },
              attribute: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  description: true,
                },
              },
            },
          }),
          database.contactAttribute.count({ where }),
        ]);

        return response.success({
          data: contactAttributes,
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
     * POST /api/contact-attribute
     * Cria ou atualiza valor de atributo para contato
     */
    createOrUpdate: igniter.mutation({
      path: '/',
      method: 'POST',
      body: z.object({
        contactId: z.string().uuid(),
        attributeId: z.string().uuid(),
        value: z.string(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { contactId, attributeId, value } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se contato pertence à organização
        const contact = await database.contact.findFirst({
          where: {
            id: contactId,
            organizationId: currentOrgId,
          },
        });

        if (!contact) {
          return response.error({
            message: 'Contato não encontrado ou não pertence a esta organização',
            status: 404,
          });
        }

        // Verificar se atributo existe e pertence à organização
        const attribute = await database.attribute.findFirst({
          where: {
            id: attributeId,
            organizationId: currentOrgId,
          },
        });

        if (!attribute) {
          return response.error({
            message: 'Atributo não encontrado ou não pertence a esta organização',
            status: 404,
          });
        }

        // Verificar se já existe valor para este atributo/contato
        const existing = await database.contactAttribute.findUnique({
          where: {
            contactId_attributeId: {
              contactId,
              attributeId,
            },
          },
        });

        let contactAttribute;

        if (existing) {
          // Atualizar valor existente
          contactAttribute = await database.contactAttribute.update({
            where: { id: existing.id },
            data: { value },
            include: {
              contact: {
                select: {
                  id: true,
                  name: true,
                  phoneNumber: true,
                },
              },
              attribute: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                },
              },
            },
          });
        } else {
          // Criar novo valor
          contactAttribute = await database.contactAttribute.create({
            data: {
              contactId,
              attributeId,
              value,
            },
            include: {
              contact: {
                select: {
                  id: true,
                  name: true,
                  phoneNumber: true,
                },
              },
              attribute: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                },
              },
            },
          });
        }

        return response.success({
          data: contactAttribute,
          message: existing
            ? 'Valor de atributo atualizado com sucesso'
            : 'Valor de atributo criado com sucesso',
        });
      },
    }),

    /**
     * GET /api/contact-attribute/contact/:contactId
     * Busca todos os atributos de um contato específico
     */
    getByContact: igniter.query({
      path: '/contact/:contactId',
      params: z.object({
        contactId: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { contactId } = context.params;
        const { currentOrgId } = context.user;

        // Verificar se contato existe e pertence à organização
        const contact = await database.contact.findFirst({
          where: {
            id: contactId,
            organizationId: currentOrgId,
          },
        });

        if (!contact) {
          return response.error({
            message: 'Contato não encontrado ou não pertence a esta organização',
            status: 404,
          });
        }

        const contactAttributes = await database.contactAttribute.findMany({
          where: { contactId },
          include: {
            attribute: {
              select: {
                id: true,
                name: true,
                type: true,
                description: true,
                isRequired: true,
                defaultValue: true,
                options: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        });

        return response.success({
          data: contactAttributes,
        });
      },
    }),

    /**
     * PUT /api/contact-attribute/:id
     * Atualiza valor de atributo existente
     */
    update: igniter.mutation({
      path: '/:id',
      method: 'PUT',
      params: z.object({
        id: z.string().uuid(),
      }),
      body: z.object({
        value: z.string(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { value } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se contactAttribute existe e pertence à organização
        const existing = await database.contactAttribute.findFirst({
          where: {
            id,
            contact: {
              organizationId: currentOrgId,
            },
          },
        });

        if (!existing) {
          return response.error({
            message: 'Atributo de contato não encontrado',
            status: 404,
          });
        }

        const contactAttribute = await database.contactAttribute.update({
          where: { id },
          data: { value },
          include: {
            contact: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
              },
            },
            attribute: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        });

        return response.success({
          data: contactAttribute,
          message: 'Valor de atributo atualizado com sucesso',
        });
      },
    }),

    /**
     * DELETE /api/contact-attribute/:id
     * Deleta valor de atributo
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

        // Verificar se contactAttribute existe e pertence à organização
        const existing = await database.contactAttribute.findFirst({
          where: {
            id,
            contact: {
              organizationId: currentOrgId,
            },
          },
        });

        if (!existing) {
          return response.error({
            message: 'Atributo de contato não encontrado',
            status: 404,
          });
        }

        await database.contactAttribute.delete({
          where: { id },
        });

        return response.success({
          message: 'Valor de atributo deletado com sucesso',
        });
      },
    }),
  },
});
