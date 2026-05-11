/**
 * Session — Lifecycle routes
 *
 * Actions: refresh (POST /refresh), logout (POST /logout)
 * Renovacao de access token e encerramento de sessao.
 */

import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import { logoutSchema } from '../auth.schemas';
import { signAccessToken, verifyRefreshToken } from '@/lib/auth/jwt';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { UserRole } from '@/lib/auth/roles';
import { RateLimiter } from '@/lib/rate-limit/rate-limiter';
import {
  getClientIdentifier,
  createAuditLog,
  setAuthCookies,
  clearAuthCookies,
} from '../_shared/helpers';

/**
 * Rate limiter para refresh de access token.
 * 60 refreshes / 10 minutos por IP — frequente o bastante para UX normal
 * (refresh default acontece a cada ~15 min), mas bloqueia abuso.
 */
const sessionRefreshRateLimiter = new RateLimiter({
  limit: 60,
  window: 600,
  prefix: 'ratelimit:session-refresh',
  failClosedInProduction: true,
});

const logoutRateLimiter = new RateLimiter({
  limit: 10,
  window: 60,
  prefix: 'ratelimit:logout',
  failClosedInProduction: true,
});

export const lifecycleRoutes = {
  /**
   * Refresh Token - Renovar access token
   */
  refresh: igniter.mutation({
    name: 'Refresh Token',
    description: 'Refresh access token',
    path: '/refresh',
    method: 'POST',
    handler: async ({ request, response }) => {
      // Rate limit leve por IP — protege contra abuso sem quebrar UX normal
      const clientIp = getClientIdentifier(request);
      const rateLimit = await sessionRefreshRateLimiter.check(clientIp);
      if (!rateLimit.success) {
        return response.status(429).json({
          error: 'Too many refresh attempts',
          retryAfter: rateLimit.retryAfter,
        });
      }

      // Read refreshToken from httpOnly cookie (primary) or body (fallback)
      const cookieHeader = request.headers.get('cookie') || '';
      const cookieRefreshToken = cookieHeader
        .split(';')
        .map((c: string) => c.trim())
        .find((c: string) => c.startsWith('refreshToken='))
        ?.split('=')
        .slice(1)
        .join('=');

      const bodyRefreshToken = (request.body as any)?.refreshToken;
      const refreshToken = cookieRefreshToken || bodyRefreshToken;

      if (!refreshToken) {
        return response.status(401).json({ error: 'No refresh token provided' });
      }

      // Verificar refresh token
      const payload = verifyRefreshToken(refreshToken as string);
      if (!payload) {
        return response.status(401).json({ error: 'Invalid refresh token' });
      }

      // Buscar refresh token no banco
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
      });

      if (!tokenData || tokenData.revokedAt || tokenData.expiresAt < new Date()) {
        return response.status(401).json({ error: 'Invalid or expired refresh token' });
      }

      if (!tokenData.user.isActive) {
        return response.status(401).json({ error: 'Account is disabled' });
      }
      // NOTE: deletedAt check omitted — User model does not have a deletedAt field.
      // If soft-delete is added to User in future, add:
      // if (tokenData.user.deletedAt) { return response.status(401).json({ error: 'Account not found' }); }

      // Obter role na organização atual
      const currentOrgRelation = tokenData.user.organizations.find(
        (org) => org.organizationId === tokenData.user.currentOrgId
      );

      // Criar novo access token
      const accessToken = signAccessToken({
        userId: tokenData.user.id,
        email: tokenData.user.email,
        role: tokenData.user.role as UserRole,
        currentOrgId: tokenData.user.currentOrgId,
        organizationRole: currentOrgRelation?.role as any,
        needsOnboarding: !tokenData.user.onboardingCompleted,
      });

      // Set new accessToken cookie
      setAuthCookies(response, accessToken);

      return response.success({ message: 'Token refreshed' });
    },
  }),

  /**
   * Logout - Revogar refresh token
   */
  logout: igniter.mutation({
    name: 'Logout',
    description: 'Logout user',
    path: '/logout',
    method: 'POST',
    body: logoutSchema,
    use: [csrfProcedure()],
    handler: async ({ request, response }) => {
      const clientIp = getClientIdentifier(request);
      const rateLimit = await logoutRateLimiter.check(clientIp);
      if (!rateLimit.success) {
        return response.status(429).json({
          error: 'Too many logout attempts',
          retryAfter: rateLimit.retryAfter,
        });
      }

      const { everywhere } = request.body;

      // Read refreshToken from httpOnly cookie (primary) or body (fallback)
      const cookieHeader = request.headers.get('cookie') || '';
      const cookieRefreshToken = cookieHeader
        .split(';')
        .map((c: string) => c.trim())
        .find((c: string) => c.startsWith('refreshToken='))
        ?.split('=')
        .slice(1)
        .join('=');

      const bodyRefreshToken = request.body?.refreshToken;
      const refreshToken = cookieRefreshToken || bodyRefreshToken;

      let logoutUserId: string | null = null;
      if (refreshToken) {
        const payload = verifyRefreshToken(refreshToken);
        if (payload) {
          logoutUserId = payload.userId;
          if (everywhere) {
            await db.refreshToken.updateMany({
              where: { userId: payload.userId, revokedAt: null },
              data: { revokedAt: new Date() },
            });
          } else {
            await db.refreshToken.update({
              where: { id: payload.tokenId },
              data: { revokedAt: new Date() },
            });
          }
        }
      }

      // Clear httpOnly cookies
      clearAuthCookies(response);

      // Audit log — registrar logout
      if (logoutUserId) {
        await createAuditLog('auth.logout', logoutUserId, request, { everywhere: !!everywhere });
      }

      return response.success({ message: 'Logged out successfully' });
    },
  }),
};
