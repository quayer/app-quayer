/**
 * Device Sessions — List routes
 *
 * Action: list (GET /)
 * Lista todas as sessoes de dispositivo NAO revogadas do usuario autenticado,
 * ordenadas por atividade mais recente.
 */

import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import { authProcedure } from '../procedures/auth.procedure';

export const listRoutes = {
  list: igniter.query({
    name: 'List Device Sessions',
    description: 'List non-revoked device sessions ordered by last activity',
    path: '/',
    method: 'GET',
    use: [authProcedure({ required: true })],
    handler: async ({ response, context }) => {
      const user = context.auth?.session?.user;
      if (!user) {
        return response.status(401).json({ error: 'Not authenticated' });
      }

      const sessions = await db.deviceSession.findMany({
        where: { userId: user.id, isRevoked: false },
        orderBy: { lastActiveAt: 'desc' },
      });

      return response.success(sessions);
    },
  }),
};
