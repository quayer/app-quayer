/**
 * Boards Controller
 * CRUD para quadros Excalidraw com organização por pastas
 */

import { igniter } from '@/igniter';
import { database } from '@/server/services/database';
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure';
import {
  createBoardSchema,
  updateBoardSchema,
  listBoardsSchema,
} from '../boards.schemas';

export const boardsController = igniter.controller({
  name: 'boards',
  path: '/boards',
  description: 'Gerenciamento de quadros Excalidraw',

  actions: {
    /**
     * POST /boards
     */
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      body: createBoardSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user || !user.currentOrgId) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { name, folder, data } = request.body;

        const board = await database.board.create({
          data: {
            name,
            folder,
            data: data ?? {},
            organizationId: user.currentOrgId,
            createdById: user.id,
          },
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        return response.success(board);
      },
    }),

    /**
     * GET /boards
     */
    list: igniter.query({
      path: '/',
      query: listBoardsSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user || !user.currentOrgId) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { folder, search } = request.query;
        const page = request.query.page ?? 1;
        const limit = request.query.limit ?? 50;
        const skip = (page - 1) * limit;

        const where: any = {
          organizationId: user.currentOrgId,
          isActive: true,
        };

        if (folder) {
          where.folder = folder;
        }

        if (search) {
          where.name = { contains: search, mode: 'insensitive' };
        }

        const [boards, total] = await Promise.all([
          database.board.findMany({
            where,
            select: {
              id: true,
              name: true,
              folder: true,
              thumbnail: true,
              createdById: true,
              createdAt: true,
              updatedAt: true,
              createdBy: {
                select: { id: true, name: true, email: true },
              },
            },
            orderBy: { updatedAt: 'desc' },
            skip,
            take: limit,
          }),
          database.board.count({ where }),
        ]);

        const folders = await database.board.findMany({
          where: {
            organizationId: user.currentOrgId,
            isActive: true,
          },
          select: { folder: true },
          distinct: ['folder'],
        });

        return response.success({
          boards,
          folders: folders.map((f) => f.folder),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      },
    }),

    /**
     * GET /boards/:id
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

        const board = await database.board.findFirst({
          where: {
            id,
            organizationId: user.currentOrgId,
            isActive: true,
          },
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        if (!board) {
          return response.notFound('Quadro não encontrado');
        }

        return response.success(board);
      },
    }),

    /**
     * PATCH /boards/:id
     */
    update: igniter.mutation({
      path: '/:id',
      method: 'PATCH',
      body: updateBoardSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user || !user.currentOrgId) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { id } = request.params as { id: string };
        const updates = request.body;

        const existing = await database.board.findFirst({
          where: {
            id,
            organizationId: user.currentOrgId,
          },
        });

        if (!existing) {
          return response.notFound('Quadro não encontrado');
        }

        const board = await database.board.update({
          where: { id },
          data: updates,
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        return response.success(board);
      },
    }),

    /**
     * DELETE /boards/:id
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

        const existing = await database.board.findFirst({
          where: {
            id,
            organizationId: user.currentOrgId,
          },
        });

        if (!existing) {
          return response.notFound('Quadro não encontrado');
        }

        await database.board.delete({ where: { id } });

        return response.success({ message: 'Quadro deletado' });
      },
    }),
  },
});
