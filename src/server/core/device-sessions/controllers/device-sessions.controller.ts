/**
 * DeviceSessions Controller
 *
 * Gerenciamento de sessões de dispositivo (login) dos usuários.
 * Permite listar, revogar e revogar todas as sessões.
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure, adminProcedure } from '@/server/core/auth/procedures/auth.procedure';
import { csrfProcedure } from '@/server/core/auth/procedures/csrf.procedure';
import { database } from '@/server/services/database';

export const deviceSessionsController = igniter.controller({
  name: 'deviceSessions',
  path: '/device-sessions',
  description: 'Gerenciamento de sessões de dispositivo dos usuários',

  actions: {
    /**
     * GET /api/v1/device-sessions/all
     * Lista TODAS as sessões de dispositivo do sistema (Admin only)
     */
    listAll: igniter.query({
      path: '/all',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(20),
        search: z.string().optional(),
        status: z.enum(['active', 'revoked']).optional(),
      }),
      use: [authProcedure({ required: true }), adminProcedure()],
      handler: async ({ request, response }) => {
        const page = request.query.page ?? 1;
        const limit = request.query.limit ?? 20;
        const { search, status } = request.query;

        const where: Record<string, unknown> = {};

        if (status === 'active') where.isRevoked = false;
        if (status === 'revoked') where.isRevoked = true;

        if (search) {
          where.OR = [
            { user: { name: { contains: search, mode: 'insensitive' } } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
            { ipAddress: { contains: search } },
          ];
        }

        const [sessions, total] = await Promise.all([
          database.deviceSession.findMany({
            where,
            orderBy: { lastActiveAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          }),
          database.deviceSession.count({ where }),
        ]);

        return response.success({
          data: sessions,
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
     * POST /api/v1/device-sessions/revoke-by-user
     * Revoga todas as sessões ativas de um usuário específico (Admin only)
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    revokeByUser: (igniter.mutation as any)({
      path: '/revoke-by-user',
      body: z.object({
        userId: z.string().uuid(),
      }),
      use: [authProcedure({ required: true }), adminProcedure(), csrfProcedure()],
      handler: async ({ request, response }: any) => {
        const { userId } = request.body;

        const result = await database.deviceSession.updateMany({
          where: {
            userId,
            isRevoked: false,
          },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
          },
        });

        return response.success({
          data: { revokedCount: result.count },
        });
      },
    }),

    /**
     * GET /api/v1/device-sessions
     * Lista as sessões de dispositivo do usuário autenticado
     */
    list: igniter.query({
      path: '/',
      use: [authProcedure({ required: true })],
      handler: async ({ response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const sessions = await database.deviceSession.findMany({
          where: { userId: user.id },
          orderBy: { lastActiveAt: 'desc' },
        });

        return response.success({ data: sessions });
      },
    }),

    /**
     * GET /api/v1/device-sessions/by-user?userId=xxx
     * Lista sessões de dispositivo de um usuário específico (Admin only)
     */
    listByUser: igniter.query({
      path: '/by-user',
      query: z.object({
        userId: z.string(),
      }),
      use: [authProcedure({ required: true }), adminProcedure()],
      handler: async ({ request, response }) => {
        const { userId } = request.query;

        const sessions = await database.deviceSession.findMany({
          where: { userId },
          orderBy: { lastActiveAt: 'desc' },
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

        return response.success({ data: sessions });
      },
    }),

    /**
     * POST /api/v1/device-sessions/revoke
     * Revoga uma sessão de dispositivo específica
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    revoke: (igniter.mutation as any)({
      path: '/revoke',
      body: z.object({
        deviceSessionId: z.string(),
      }),
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }: any) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { deviceSessionId } = request.body;

        // Verificar que a sessão pertence ao usuário (ou é admin)
        const session = await database.deviceSession.findUnique({
          where: { id: deviceSessionId },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        if (session.userId !== user.id && user.role !== 'admin') {
          return response.forbidden('Sem permissão para revogar esta sessão');
        }

        const updated = await database.deviceSession.update({
          where: { id: deviceSessionId },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
          },
        });

        return response.success({ data: updated });
      },
    }),

    /**
     * POST /api/v1/device-sessions/revoke-all
     * Revoga todas as sessões do usuário exceto a sessão atual
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    revokeAll: (igniter.mutation as any)({
      path: '/revoke-all',
      body: z.object({
        currentDeviceSessionId: z.string().optional(),
      }),
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }: any) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { currentDeviceSessionId } = request.body;

        const whereClause: Record<string, unknown> = {
          userId: user.id,
          isRevoked: false,
        };

        // Excluir a sessão atual se fornecida
        if (currentDeviceSessionId) {
          whereClause.id = { not: currentDeviceSessionId };
        }

        const result = await database.deviceSession.updateMany({
          where: whereClause,
          data: {
            isRevoked: true,
            revokedAt: new Date(),
          },
        });

        return response.success({
          data: { revokedCount: result.count },
        });
      },
    }),
  },
});
