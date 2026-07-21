/**
 * oRPC — porta mecânica do controller `deviceSessions` (Igniter.js -> oRPC)
 *
 * Origem:
 *   src/server/core/auth/device-sessions/device-sessions.controller.ts
 *   src/server/core/auth/device-sessions/list.routes.ts
 *   src/server/core/auth/device-sessions/revoke.routes.ts
 *
 * Preservação de URL (basePath /api/v1 + controller /device-sessions + action):
 *   list       GET  /api/v1/device-sessions
 *   revoke     POST /api/v1/device-sessions/revoke
 *   revokeAll  POST /api/v1/device-sessions/revoke-all
 *
 * Shapes de resposta preservados 1:1 via ok() — envelope Igniter
 * { data, error: null } (o frontend sessoes-tab.tsx consome essas URLs com
 * fetch cru; ver envelope.ts):
 *   list       -> { data: DeviceSession[], error: null }
 *   revoke     -> { data: { message: ... }, error: null }
 *   revokeAll  -> { data: { revokedCount: number }, error: null }
 *
 * Middlewares: authProcedure({required:true}) -> requireAuth;
 * csrfProcedure() -> requireCsrf (só nas mutations, como no original).
 * createAuditLog é REUSADO (mesmo módulo _shared/helpers) — recebe um
 * RequestLike com os Headers do contexto para extração de IP.
 *
 * LIMITACAO herdada do original (documentada em revoke.routes.ts): revogação
 * é UI-only enquanto não houver link RefreshToken.deviceSessionId — o JWT
 * cookie continua válido até a expiração natural (~15min).
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { database as db } from '@/server/services/database'
import { createAuditLog } from '@/server/core/auth/_shared/helpers'
import { ok } from './envelope'
import { requireAuth } from './auth.middleware'
import { requireCsrf } from './csrf.middleware'
import { base } from './base'

const revokeBodySchema = z.object({
  deviceSessionId: z.string().min(1),
})

const revokeAllBodySchema = z.object({
  currentDeviceSessionId: z.string().min(1).optional(),
})

/** Equivale a `use: [authProcedure({ required: true })]`. */
const authed = base.use(requireAuth)

/** Equivale a `use: [authProcedure({ required: true }), csrfProcedure()]`. */
const authedCsrf = authed.use(requireCsrf)

// ==========================================
// LIST — GET /device-sessions
// ==========================================
export const list = authed
  .route({
    method: 'GET',
    path: '/device-sessions',
    summary: 'List Device Sessions',
    description: 'List non-revoked device sessions ordered by last activity',
  })
  .handler(async ({ context }) => {
    const user = context.auth.session.user
    if (!user) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Not authenticated' })
    }

    const sessions = await db.deviceSession.findMany({
      where: { userId: user.id, isRevoked: false },
      orderBy: { lastActiveAt: 'desc' },
    })

    // response.success(sessions) -> { data: sessions, error: null }
    return ok(sessions)
  })

// ==========================================
// REVOKE — POST /device-sessions/revoke
// ==========================================
export const revoke = authedCsrf
  .route({
    method: 'POST',
    path: '/device-sessions/revoke',
    summary: 'Revoke Device Session',
    description: 'Revoke a specific device session (IDOR-guarded)',
  })
  .input(revokeBodySchema)
  .handler(async ({ input, context }) => {
    const user = context.auth.session.user
    if (!user) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Not authenticated' })
    }

    const { deviceSessionId } = input

    // IDOR guard: ensure the session belongs to the requesting user
    const session = await db.deviceSession.findFirst({
      where: { id: deviceSessionId, userId: user.id },
    })

    if (!session) {
      throw new ORPCError('NOT_FOUND', { message: 'Device session not found' })
    }

    // Idempotent: already revoked
    if (session.isRevoked) {
      return ok({ message: 'Already revoked' })
    }

    await db.deviceSession.update({
      where: { id: deviceSessionId },
      data: { isRevoked: true, revokedAt: new Date() },
    })

    await createAuditLog(
      'auth.device_session.revoke',
      user.id,
      { headers: context.headers },
      { deviceSessionId },
    )

    return ok({ message: 'Device session revoked' })
  })

// ==========================================
// REVOKE ALL — POST /device-sessions/revoke-all
// ==========================================
export const revokeAll = authedCsrf
  .route({
    method: 'POST',
    path: '/device-sessions/revoke-all',
    summary: 'Revoke All Device Sessions',
    description: 'Revoke all active device sessions, optionally preserving the current device',
  })
  .input(revokeAllBodySchema)
  .handler(async ({ input, context }) => {
    const user = context.auth.session.user
    if (!user) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Not authenticated' })
    }

    const { currentDeviceSessionId } = input

    const where = {
      userId: user.id,
      isRevoked: false,
      ...(currentDeviceSessionId ? { NOT: { id: currentDeviceSessionId } } : {}),
    }

    const result = await db.deviceSession.updateMany({
      where,
      data: { isRevoked: true, revokedAt: new Date() },
    })

    await createAuditLog(
      'auth.device_session.revoke_all',
      user.id,
      { headers: context.headers },
      { count: result.count, excludedDeviceSessionId: currentDeviceSessionId ?? null },
    )

    return ok({ revokedCount: result.count })
  })

/** Namespace espelhando o controller (api.deviceSessions.* no client Igniter). */
export const deviceSessions = {
  list,
  revoke,
  revokeAll,
}
