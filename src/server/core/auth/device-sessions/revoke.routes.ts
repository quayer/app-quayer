/**
 * Device Sessions — Revoke routes
 *
 * Actions:
 *   revoke    (POST /revoke)      — revoga uma sessao especifica (IDOR-guarded)
 *   revokeAll (POST /revoke-all)  — revoga todas as outras sessoes do usuario
 *
 * LIMITACAO: revogacao e UI-only enquanto nao houver link
 * RefreshToken.deviceSessionId — JWT cookie continua valido ate expiracao
 * natural (~15min). Migration futura: adicionar `deviceSessionId` em RefreshToken.
 */

import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import { z } from 'zod';
import { authProcedure } from '../procedures/auth.procedure';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { createAuditLog } from '../_shared/helpers';

const revokeBodySchema = z.object({
  deviceSessionId: z.string().min(1),
});

const revokeAllBodySchema = z.object({
  currentDeviceSessionId: z.string().min(1).optional(),
});

export const revokeRoutes = {
  revoke: igniter.mutation({
    name: 'Revoke Device Session',
    description: 'Revoke a specific device session (IDOR-guarded)',
    path: '/revoke',
    method: 'POST',
    body: revokeBodySchema,
    use: [authProcedure({ required: true }), csrfProcedure()],
    handler: async ({ request, response, context }) => {
      const user = context.auth?.session?.user;
      if (!user) {
        return response.status(401).json({ error: 'Not authenticated' });
      }

      const { deviceSessionId } = request.body;

      // IDOR guard: ensure the session belongs to the requesting user
      const session = await db.deviceSession.findFirst({
        where: { id: deviceSessionId, userId: user.id },
      });

      if (!session) {
        return response.status(404).json({ error: 'Device session not found' });
      }

      // Idempotent: already revoked
      if (session.isRevoked) {
        return response.success({ message: 'Already revoked' });
      }

      await db.deviceSession.update({
        where: { id: deviceSessionId },
        data: { isRevoked: true, revokedAt: new Date() },
      });

      await createAuditLog(
        'auth.device_session.revoke',
        user.id,
        request,
        { deviceSessionId },
      );

      return response.success({ message: 'Device session revoked' });
    },
  }),

  revokeAll: igniter.mutation({
    name: 'Revoke All Device Sessions',
    description: 'Revoke all active device sessions, optionally preserving the current device',
    path: '/revoke-all',
    method: 'POST',
    body: revokeAllBodySchema,
    use: [authProcedure({ required: true }), csrfProcedure()],
    handler: async ({ request, response, context }) => {
      const user = context.auth?.session?.user;
      if (!user) {
        return response.status(401).json({ error: 'Not authenticated' });
      }

      const { currentDeviceSessionId } = request.body;

      const where = {
        userId: user.id,
        isRevoked: false,
        ...(currentDeviceSessionId ? { NOT: { id: currentDeviceSessionId } } : {}),
      };

      const result = await db.deviceSession.updateMany({
        where,
        data: { isRevoked: true, revokedAt: new Date() },
      });

      await createAuditLog(
        'auth.device_session.revoke_all',
        user.id,
        request,
        { count: result.count, excludedDeviceSessionId: currentDeviceSessionId ?? null },
      );

      return response.success({ revokedCount: result.count });
    },
  }),
};
