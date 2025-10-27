import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';

/**
 * Kanban Controller
 *
 * Gerenciamento de boards e colunas Kanban para pipeline de vendas/leads
 *
 * Rotas:
 * - POST /api/kanban                            - Criar board
 * - GET  /api/kanban                            - Listar boards
 * - GET  /api/kanban/:boardId                   - Buscar board por ID
 * - POST /api/kanban/:boardId/columns           - Criar coluna
 * - PATCH /api/kanban/:boardId/columns/:columnId - Atualizar coluna
 * - DELETE /api/kanban/:boardId/columns/:columnId - Deletar coluna
 * - PATCH /api/kanban/:boardId/:columnId/attach - Vincular tabulação à coluna
 * - DELETE /api/kanban/:boardId/:columnId/detach - Desvincular tabulação da coluna
 */
export const kanbanController = igniter.controller({
  name: 'kanban',
  description: 'Gerenciamento de Kanban boards para pipeline de vendas/leads',

  actions: {
    /**
     * POST /api/kanban
     * Cria novo board Kanban
     */
    createBoard: igniter.mutation({
      path: '/',
      method: 'POST',
      body: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { name, description } = context.body;
        const { currentOrgId } = context.user;

        const board = await database.kanbanBoard.create({
          data: {
            organizationId: currentOrgId,
            name,
            description,
          },
        });

        return response.success({
          data: board,
          message: 'Board Kanban criado com sucesso',
        });
      },
    }),

    /**
     * GET /api/kanban
     * Lista todos os boards da organização
     */
    listBoards: igniter.query({
      path: '/',
      query: z.object({
        isActive: z.coerce.boolean().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { isActive } = context.query;
        const { currentOrgId } = context.user;

        const where: any = {
          organizationId: currentOrgId,
        };

        if (isActive !== undefined) {
          where.isActive = isActive;
        }

        const boards = await database.kanbanBoard.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: {
                columns: true,
              },
            },
          },
        });

        return response.success({
          data: boards.map((board) => ({
            id: board.id,
            name: board.name,
            description: board.description,
            isActive: board.isActive,
            createdAt: board.createdAt,
            updatedAt: board.updatedAt,
            columnsCount: board._count.columns,
          })),
        });
      },
    }),

    /**
     * GET /api/kanban/:boardId
     * Busca board por ID com todas as colunas
     */
    getBoard: igniter.query({
      path: '/:boardId',
      params: z.object({
        boardId: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { boardId } = context.params;
        const { currentOrgId } = context.user;

        const board = await database.kanbanBoard.findFirst({
          where: {
            id: boardId,
            organizationId: currentOrgId,
          },
          include: {
            columns: {
              orderBy: { position: 'asc' },
              include: {
                tabulation: {
                  select: {
                    id: true,
                    name: true,
                    backgroundColor: true,
                  },
                },
              },
            },
          },
        });

        if (!board) {
          return response.error({
            message: 'Board não encontrado',
            status: 404,
          });
        }

        return response.success({
          data: board,
        });
      },
    }),

    /**
     * POST /api/kanban/:boardId/columns
     * Cria nova coluna no board
     */
    createColumn: igniter.mutation({
      path: '/:boardId/columns',
      method: 'POST',
      params: z.object({
        boardId: z.string().uuid(),
      }),
      body: z.object({
        name: z.string().min(1),
        position: z.number().int().min(0),
        backgroundColor: z.string().default('#ffffff'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { boardId } = context.params;
        const { name, position, backgroundColor } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se board existe e pertence à organização
        const board = await database.kanbanBoard.findFirst({
          where: {
            id: boardId,
            organizationId: currentOrgId,
          },
        });

        if (!board) {
          return response.error({
            message: 'Board não encontrado',
            status: 404,
          });
        }

        const column = await database.kanbanColumn.create({
          data: {
            boardId,
            name,
            position,
            backgroundColor,
          },
          include: {
            tabulation: true,
          },
        });

        return response.success({
          data: column,
          message: 'Coluna criada com sucesso',
        });
      },
    }),

    /**
     * PATCH /api/kanban/:boardId/columns/:columnId
     * Atualiza coluna existente
     */
    updateColumn: igniter.mutation({
      path: '/:boardId/columns/:columnId',
      method: 'PATCH',
      params: z.object({
        boardId: z.string().uuid(),
        columnId: z.string().uuid(),
      }),
      body: z.object({
        name: z.string().min(1).optional(),
        position: z.number().int().min(0).optional(),
        backgroundColor: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { boardId, columnId } = context.params;
        const { name, position, backgroundColor } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se coluna e board existem e pertencem à organização
        const column = await database.kanbanColumn.findFirst({
          where: {
            id: columnId,
            boardId,
            board: {
              organizationId: currentOrgId,
            },
          },
        });

        if (!column) {
          return response.error({
            message: 'Coluna não encontrada',
            status: 404,
          });
        }

        const updated = await database.kanbanColumn.update({
          where: { id: columnId },
          data: {
            ...(name && { name }),
            ...(position !== undefined && { position }),
            ...(backgroundColor && { backgroundColor }),
          },
          include: {
            tabulation: true,
          },
        });

        return response.success({
          data: updated,
          message: 'Coluna atualizada com sucesso',
        });
      },
    }),

    /**
     * DELETE /api/kanban/:boardId/columns/:columnId
     * Deleta coluna
     */
    deleteColumn: igniter.mutation({
      path: '/:boardId/columns/:columnId',
      method: 'DELETE',
      params: z.object({
        boardId: z.string().uuid(),
        columnId: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { boardId, columnId } = context.params;
        const { currentOrgId } = context.user;

        // Verificar se coluna e board existem e pertencem à organização
        const column = await database.kanbanColumn.findFirst({
          where: {
            id: columnId,
            boardId,
            board: {
              organizationId: currentOrgId,
            },
          },
        });

        if (!column) {
          return response.error({
            message: 'Coluna não encontrada',
            status: 404,
          });
        }

        await database.kanbanColumn.delete({
          where: { id: columnId },
        });

        return response.success({
          message: 'Coluna deletada com sucesso',
        });
      },
    }),

    /**
     * PATCH /api/kanban/:boardId/:columnId/attach
     * Vincular tabulação à coluna
     */
    attachTabulation: igniter.mutation({
      path: '/:boardId/:columnId/attach',
      method: 'PATCH',
      params: z.object({
        boardId: z.string().uuid(),
        columnId: z.string().uuid(),
      }),
      body: z.object({
        tabulationId: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { boardId, columnId } = context.params;
        const { tabulationId } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se coluna e board existem e pertencem à organização
        const column = await database.kanbanColumn.findFirst({
          where: {
            id: columnId,
            boardId,
            board: {
              organizationId: currentOrgId,
            },
          },
        });

        if (!column) {
          return response.error({
            message: 'Coluna não encontrada',
            status: 404,
          });
        }

        // Verificar se tabulação existe e pertence à organização
        const tabulation = await database.tabulation.findFirst({
          where: {
            id: tabulationId,
            organizationId: currentOrgId,
          },
        });

        if (!tabulation) {
          return response.error({
            message: 'Tabulação não encontrada',
            status: 404,
          });
        }

        const updated = await database.kanbanColumn.update({
          where: { id: columnId },
          data: {
            tabulationId,
          },
          include: {
            tabulation: true,
          },
        });

        return response.success({
          data: updated,
          message: 'Tabulação vinculada à coluna com sucesso',
        });
      },
    }),

    /**
     * DELETE /api/kanban/:boardId/:columnId/detach
     * Desvincular tabulação da coluna
     */
    detachTabulation: igniter.mutation({
      path: '/:boardId/:columnId/detach',
      method: 'DELETE',
      params: z.object({
        boardId: z.string().uuid(),
        columnId: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { boardId, columnId } = context.params;
        const { currentOrgId } = context.user;

        // Verificar se coluna e board existem e pertencem à organização
        const column = await database.kanbanColumn.findFirst({
          where: {
            id: columnId,
            boardId,
            board: {
              organizationId: currentOrgId,
            },
          },
        });

        if (!column) {
          return response.error({
            message: 'Coluna não encontrada',
            status: 404,
          });
        }

        const updated = await database.kanbanColumn.update({
          where: { id: columnId },
          data: {
            tabulationId: null,
          },
        });

        return response.success({
          data: updated,
          message: 'Tabulação desvinculada da coluna com sucesso',
        });
      },
    }),
  },
});
