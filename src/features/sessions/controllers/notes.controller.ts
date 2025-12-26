/**
 * Session Notes Controller
 * CRUD para notas internas de atendentes em sessões
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { database } from '@/services/database';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';

export const notesController = igniter.controller({
  name: 'notes',
  path: '/notes',
  description: 'Gerenciamento de notas internas em sessões',

  actions: {
    /**
     * POST /notes
     * Criar nova nota interna
     */
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      body: z.object({
        sessionId: z.string().uuid('ID da sessão inválido'),
        content: z.string().min(1, 'Conteúdo não pode estar vazio').max(5000, 'Nota muito longa'),
        isPinned: z.boolean().optional().default(false),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { sessionId, content, isPinned } = request.body;

        // Verificar se sessão existe e pertence à organização do usuário
        const session = await database.chatSession.findUnique({
          where: { id: sessionId },
          select: { organizationId: true },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta sessão');
        }

        // Criar nota
        const note = await database.sessionNote.create({
          data: {
            sessionId,
            authorId: user.id,
            content,
            isPinned,
          },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        return response.success(note);
      },
    }),

    /**
     * GET /notes
     * Listar notas de uma sessão
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        sessionId: z.string().uuid('ID da sessão inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { sessionId } = request.query;

        // Verificar permissões
        const session = await database.chatSession.findUnique({
          where: { id: sessionId },
          select: { organizationId: true },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        // Buscar notas ordenadas: pinadas primeiro, depois por data
        const notes = await database.sessionNote.findMany({
          where: { sessionId },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: [
            { isPinned: 'desc' },
            { createdAt: 'desc' },
          ],
        });

        return response.success(notes);
      },
    }),

    /**
     * PATCH /notes/:id
     * Atualizar nota
     */
    update: igniter.mutation({
      path: '/:id',
      method: 'PATCH',
      body: z.object({
        content: z.string().min(1).max(5000).optional(),
        isPinned: z.boolean().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params as { id: string };
        const { content, isPinned } = request.body;

        // Buscar nota
        const note = await database.sessionNote.findUnique({
          where: { id },
          include: {
            session: {
              select: { organizationId: true },
            },
          },
        });

        if (!note) {
          return response.notFound('Nota não encontrada');
        }

        // Verificar permissões: só o autor ou admin pode editar
        if (user.role !== 'admin' && note.authorId !== user.id) {
          return response.forbidden('Apenas o autor pode editar esta nota');
        }

        // Atualizar
        const updatedNote = await database.sessionNote.update({
          where: { id },
          data: {
            ...(content !== undefined && { content }),
            ...(isPinned !== undefined && { isPinned }),
          },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        return response.success(updatedNote);
      },
    }),

    /**
     * DELETE /notes/:id
     * Deletar nota
     */
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params as { id: string };

        // Buscar nota
        const note = await database.sessionNote.findUnique({
          where: { id },
        });

        if (!note) {
          return response.notFound('Nota não encontrada');
        }

        // Verificar permissões: só o autor ou admin pode deletar
        if (user.role !== 'admin' && note.authorId !== user.id) {
          return response.forbidden('Apenas o autor pode deletar esta nota');
        }

        // Deletar
        await database.sessionNote.delete({
          where: { id },
        });

        return response.success({ message: 'Nota deletada com sucesso' });
      },
    }),

    /**
     * POST /notes/:id/pin
     * Fixar/desafixar nota
     */
    togglePin: igniter.mutation({
      path: '/:id/pin',
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params as { id: string };

        // Buscar nota
        const note = await database.sessionNote.findUnique({
          where: { id },
          include: {
            session: {
              select: { organizationId: true },
            },
          },
        });

        if (!note) {
          return response.notFound('Nota não encontrada');
        }

        // Verificar permissões
        if (user.role !== 'admin' && note.session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        // Toggle pin
        const updatedNote = await database.sessionNote.update({
          where: { id },
          data: { isPinned: !note.isPinned },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        return response.success(updatedNote);
      },
    }),
  },
});
