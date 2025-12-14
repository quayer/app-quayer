import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';

/**
 * Contact Observations Controller
 *
 * Gerenciamento de notas/observações para contatos
 *
 * Rotas:
 * - POST   /api/contact-observation                - Criar observação
 * - GET    /api/contact-observation/contact/:contactId - Listar por contato
 * - PUT    /api/contact-observation/:id            - Atualizar observação
 * - DELETE /api/contact-observation/:id            - Deletar observação
 */
export const observationsController = igniter.controller({
  name: 'contact-observation',
  path: '/contact-observation',
  description: 'Gerenciamento de observações para contatos',

  actions: {
    /**
     * POST /api/contact-observation
     * Criar nova observação
     */
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      body: z.object({
        contactId: z.string().uuid(),
        content: z.string().min(1),
        type: z.enum(['note', 'warning', 'important']).default('note'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { contactId, content, type } = request.body;
        const { id: userId, currentOrgId } = context.auth?.session?.user!;

        // Verificar se contato existe e pertence à organização
        const contact = await database.contact.findFirst({
          where: {
            id: contactId,
            organizationId: currentOrgId!,
          },
        });

        if (!contact) {
          return response.notFound('Contato não encontrado ou não pertence a esta organização');
        }

        const observation = await database.contactObservation.create({
          data: {
            contactId,
            userId,
            content,
            type,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        return response.success({
          data: observation,
          message: 'Observação criada com sucesso',
        });
      },
    }),

    /**
     * GET /api/contact-observation/contact/:contactId
     * Listar observações de um contato
     */
    getByContact: igniter.query({
      path: '/contact/:contactId',
      query: z.object({
        type: z.enum(['note', 'warning', 'important']).optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { contactId } = request.params as any;
        const { type } = request.query as any;
        const { currentOrgId } = context.auth?.session?.user!;

        // Verificar se contato existe e pertence à organização
        const contact = await database.contact.findFirst({
          where: {
            id: contactId,
            organizationId: currentOrgId!,
          },
        });

        if (!contact) {
          return response.notFound('Contato não encontrado ou não pertence a esta organização');
        }

        const where: any = { contactId };

        if (type) {
          where.type = type;
        }

        const observations = await database.contactObservation.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        return response.success({
          data: observations,
        });
      },
    }),

    /**
     * PUT /api/contact-observation/:id
     * Atualizar observação
     */
    update: igniter.mutation({
      path: '/:id',
      method: 'PUT',
      body: z.object({
        content: z.string().min(1).optional(),
        type: z.enum(['note', 'warning', 'important']).optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = request.params as any;
        const { content, type } = request.body;
        const { id: userId, role, currentOrgId } = context.auth?.session?.user!;

        // Verificar se observação existe e pertence à organização do contato
        const existing = await database.contactObservation.findFirst({
          where: {
            id,
            contact: {
              organizationId: currentOrgId!,
            },
          },
        });

        if (!existing) {
          return response.notFound('Observação não encontrada');
        }

        // Verificar se o usuário é o autor ou tem permissão
        if (existing.userId !== userId && role !== 'admin') {
          return response.forbidden('Você não tem permissão para editar esta observação');
        }

        const observation = await database.contactObservation.update({
          where: { id },
          data: {
            ...(content && { content }),
            ...(type && { type }),
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        return response.success({
          data: observation,
          message: 'Observação atualizada com sucesso',
        });
      },
    }),

    /**
     * DELETE /api/contact-observation/:id
     * Deletar observação
     */
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = request.params as any;
        const { id: userId, role, currentOrgId } = context.auth?.session?.user!;

        // Verificar se observação existe e pertence à organização do contato
        const existing = await database.contactObservation.findFirst({
          where: {
            id,
            contact: {
              organizationId: currentOrgId!,
            },
          },
        });

        if (!existing) {
          return response.notFound('Observação não encontrada');
        }

        // Verificar se o usuário é o autor ou tem permissão
        if (existing.userId !== userId && role !== 'admin') {
          return response.forbidden('Você não tem permissão para deletar esta observação');
        }

        await database.contactObservation.delete({
          where: { id },
        });

        return response.success({
          message: 'Observação deletada com sucesso',
        });
      },
    }),
  },
});
