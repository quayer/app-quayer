/**
 * Auth/Session — porta mecânica para oRPC (lote 1 do controller auth).
 *
 * Origem: ./csrf.routes.ts + ./lifecycle.routes.ts + ./organization.routes.ts
 * (4 actions). Primeiro lote que ESCREVE COOKIES no oRPC: os helpers
 * originais (setAuthCookies/clearAuthCookies de _shared/helpers e
 * setCsrfCookie de lib/auth/csrf) são REUSADOS verbatim via
 * cookieWriter(context.resHeaders) — ver src/orpc/cookies.ts.
 *
 * Preservação de URL (basePath /api/v1 + controller /auth + action):
 *   csrf                GET  /api/v1/auth/csrf
 *   refresh             POST /api/v1/auth/refresh
 *   logout              POST /api/v1/auth/logout
 *   switchOrganization  POST /api/v1/auth/switch-organization
 *
 * Fidelidade: mesmos rate limiters (mesmo prefix Redis — instância nova,
 * chave compartilhada com o Igniter enquanto convivem), mesma leitura do
 * refreshToken (cookie primário, body fallback), mesma rotação de refresh
 * token no switch, mesmos audit logs. Erros: status preservado, corpo no
 * shape oRPC (delta aceito) — exceto 429, que carrega { retryAfter } em
 * data para o backoff do client.
 */
import { ORPCError } from '@orpc/server'
import { database as db } from '@/server/services/database'
import { logoutSchema, switchOrganizationSchema } from '../auth.schemas'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getExpirationDate,
} from '@/lib/auth/jwt'
import { generateCsrfToken, setCsrfCookie } from '@/lib/auth/csrf'
import { UserRole } from '@/lib/auth/roles'
import { RateLimiter } from '@/lib/rate-limit/rate-limiter'
import {
  getClientIdentifier,
  createAuditLog,
  setAuthCookies,
  clearAuthCookies,
} from '../_shared/helpers'
import { z } from 'zod'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { cookieWriter } from '@/orpc/cookies'
import { requireAuth } from '@/orpc/auth.middleware'
import { requireCsrf } from '@/orpc/csrf.middleware'

/** Mesmas configs/prefixos do lifecycle.routes.ts — limite compartilhado via Redis. */
const sessionRefreshRateLimiter = new RateLimiter({
  limit: 60,
  window: 600,
  prefix: 'ratelimit:session-refresh',
  failClosedInProduction: true,
})

const logoutRateLimiter = new RateLimiter({
  limit: 10,
  window: 60,
  prefix: 'ratelimit:logout',
  failClosedInProduction: true,
})

/** Mesma leitura do refreshToken httpOnly (cookie primário) dos originais. */
function refreshTokenFromCookie(headers: Headers): string | undefined {
  const cookieHeader = headers.get('cookie') || ''
  return cookieHeader
    .split(';')
    .map((c: string) => c.trim())
    .find((c: string) => c.startsWith('refreshToken='))
    ?.split('=')
    .slice(1)
    .join('=')
}

const authed = base.use(requireAuth)

// ──────────────────────────────────────────────────────────────────────────
// CSRF — GET /auth/csrf (público)
// ──────────────────────────────────────────────────────────────────────────
export const csrf = base
  .route({
    method: 'GET',
    path: '/auth/csrf',
    summary: 'Get CSRF Token',
    description: 'Generate a new CSRF token and set it as a cookie',
  })
  .handler(async ({ context }) => {
    const csrfToken = generateCsrfToken()
    setCsrfCookie(cookieWriter(context.resHeaders), csrfToken)
    return ok({ token: csrfToken })
  })

// ──────────────────────────────────────────────────────────────────────────
// REFRESH — POST /auth/refresh (público; rate-limited por IP)
// ──────────────────────────────────────────────────────────────────────────
export const refresh = base
  .route({
    method: 'POST',
    path: '/auth/refresh',
    summary: 'Refresh Token',
    description: 'Refresh access token',
  })
  .input(z.object({ refreshToken: z.string().optional() }).optional())
  .handler(async ({ input, context }) => {
    const clientIp = getClientIdentifier({ headers: context.headers })
    const rateLimit = await sessionRefreshRateLimiter.check(clientIp)
    if (!rateLimit.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many refresh attempts',
        data: { retryAfter: rateLimit.retryAfter },
      })
    }

    // Cookie httpOnly (primário) ou body (fallback) — cópia 1:1
    const refreshToken = refreshTokenFromCookie(context.headers) || input?.refreshToken

    if (!refreshToken) {
      throw new ORPCError('UNAUTHORIZED', { message: 'No refresh token provided' })
    }

    const payload = verifyRefreshToken(refreshToken)
    if (!payload) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Invalid refresh token' })
    }

    const tokenData = await db.refreshToken.findUnique({
      where: { id: payload.tokenId },
      include: {
        user: {
          include: {
            organizations: {
              where: { isActive: true },
            },
          },
        },
      },
    })

    if (!tokenData || tokenData.revokedAt || tokenData.expiresAt < new Date()) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Invalid or expired refresh token' })
    }

    if (!tokenData.user.isActive) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Account is disabled' })
    }

    const currentOrgRelation = tokenData.user.organizations.find(
      (org) => org.organizationId === tokenData.user.currentOrgId,
    )

    const accessToken = signAccessToken({
      userId: tokenData.user.id,
      email: tokenData.user.email,
      role: tokenData.user.role as UserRole,
      currentOrgId: tokenData.user.currentOrgId,
      organizationRole: currentOrgRelation?.role as never,
      needsOnboarding: !tokenData.user.onboardingCompleted,
    })

    // Novo accessToken + rotação de CSRF (o helper faz os dois)
    setAuthCookies(cookieWriter(context.resHeaders), accessToken)

    return ok({ message: 'Token refreshed' })
  })

// ──────────────────────────────────────────────────────────────────────────
// LOGOUT — POST /auth/logout (CSRF; sem auth — cópia do original)
// ──────────────────────────────────────────────────────────────────────────
export const logout = base
  .use(requireCsrf)
  .route({
    method: 'POST',
    path: '/auth/logout',
    summary: 'Logout',
    description: 'Logout user',
  })
  .input(logoutSchema)
  .handler(async ({ input, context }) => {
    const clientIp = getClientIdentifier({ headers: context.headers })
    const rateLimit = await logoutRateLimiter.check(clientIp)
    if (!rateLimit.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many logout attempts',
        data: { retryAfter: rateLimit.retryAfter },
      })
    }

    const { everywhere } = input

    const refreshToken = refreshTokenFromCookie(context.headers) || input.refreshToken

    let logoutUserId: string | null = null
    if (refreshToken) {
      const payload = verifyRefreshToken(refreshToken)
      if (payload) {
        logoutUserId = payload.userId
        if (everywhere) {
          await db.refreshToken.updateMany({
            where: { userId: payload.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          })
        } else {
          await db.refreshToken.update({
            where: { id: payload.tokenId },
            data: { revokedAt: new Date() },
          })
        }
      }
    }

    clearAuthCookies(cookieWriter(context.resHeaders))

    if (logoutUserId) {
      await createAuditLog('auth.logout', logoutUserId, { headers: context.headers }, {
        everywhere: !!everywhere,
      })
    }

    return ok({ message: 'Logged out successfully' })
  })

// ──────────────────────────────────────────────────────────────────────────
// SWITCH ORGANIZATION — POST /auth/switch-organization (auth + CSRF)
// ──────────────────────────────────────────────────────────────────────────
export const switchOrganization = authed
  .use(requireCsrf)
  .route({
    method: 'POST',
    path: '/auth/switch-organization',
    summary: 'Switch Organization',
    description: 'Switch current organization',
  })
  .input(switchOrganizationSchema)
  .handler(async ({ input, context }) => {
    const user = context.auth.session.user
    if (!user) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Not authenticated' })
    }

    const { organizationId } = input

    const userWithOrgs = await db.user.findUnique({
      where: { id: user.id },
      include: {
        organizations: {
          where: { isActive: true },
          include: { organization: true },
        },
      },
    })

    if (!userWithOrgs) {
      throw new ORPCError('NOT_FOUND', { message: 'User not found' })
    }

    const userOrg = userWithOrgs.organizations.find(
      (org) => org.organizationId === organizationId,
    )

    if (!userOrg && user.role !== 'admin') {
      throw new ORPCError('FORBIDDEN', { message: 'Access denied to this organization' })
    }

    if (user.role === 'admin' && !userOrg) {
      const orgExists = await db.organization.findUnique({
        where: { id: organizationId },
      })
      if (!orgExists) {
        throw new ORPCError('NOT_FOUND', { message: 'Organization not found' })
      }
    }

    await db.user.update({
      where: { id: user.id },
      data: { currentOrgId: organizationId },
    })

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      currentOrgId: organizationId,
      organizationRole: userOrg?.role as never,
      needsOnboarding: !user.onboardingCompleted,
    })

    // Rotação do refresh token — cópia 1:1 do original
    const currentRawRefreshToken = refreshTokenFromCookie(context.headers)

    if (currentRawRefreshToken) {
      const currentPayload = verifyRefreshToken(currentRawRefreshToken)
      if (currentPayload) {
        await db.refreshToken.update({
          where: { id: currentPayload.tokenId },
          data: { revokedAt: new Date() },
        })
      }
    }

    const refreshTokenData = await db.refreshToken.create({
      data: {
        userId: user.id,
        token: signRefreshToken({ userId: user.id, tokenId: '' }),
        expiresAt: getExpirationDate('7d'),
      },
    })

    const newRefreshToken = signRefreshToken({
      userId: user.id,
      tokenId: refreshTokenData.id,
    })

    await db.refreshToken.update({
      where: { id: refreshTokenData.id },
      data: { token: newRefreshToken },
    })

    setAuthCookies(cookieWriter(context.resHeaders), accessToken, newRefreshToken)

    await createAuditLog(
      'auth.switch_organization',
      user.id,
      { headers: context.headers },
      {
        fromOrgId: user.currentOrgId ?? null,
        toOrgId: organizationId,
        organizationRole: userOrg?.role ?? null,
      },
      organizationId,
    )

    return ok({
      currentOrgId: organizationId,
      organizationRole: userOrg?.role || null,
    })
  })

/** Lote session do namespace auth (api.auth.* no client Igniter). */
export const sessionActions = {
  csrf,
  refresh,
  logout,
  switchOrganization,
}
