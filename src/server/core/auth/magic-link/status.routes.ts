/**
 * Magic Link — Status Routes
 *
 * Expõe a action `checkMagicLinkStatus`: polling cross-tab que detecta quando
 * o magic link foi clicado em outra aba e autentica a aba original.
 *
 * Segurança (C-3):
 *  - `mlpoll` cookie: segredo plain-text (httpOnly, path-scoped) enviado apenas
 *    pela aba originadora. Comparação via timingSafeEqual após SHA-256.
 *  - A aba original NÃO pode contornar 2FA: se 2FA ativo, retorna challenge.
 *  - Emite access + refresh tokens (comportamento preservado do original).
 *
 * Contratos preservados (paths, shapes de response, nomes de action).
 */

import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import crypto from 'crypto';
import { checkMagicLinkStatusSchema } from '../auth.schemas';
import { authRateLimiter } from '@/lib/rate-limit/rate-limiter';
import {
  getClientIdentifier,
  registerDeviceSession,
  sign2faChallenge,
} from '../_shared/helpers';
import { issueSession } from '../_shared/issue-session';
import { UserRole } from '@/lib/auth/roles';

export const statusRoutes = {
  /**
   * POST /auth/check-magic-link-status
   *
   * Polling endpoint called by the original tab every ~3 s.
   * Returns { verified: false } until the magic link has been clicked in
   * another tab, then issues full auth cookies (access + refresh) for the
   * polling tab.
   */
  checkMagicLinkStatus: igniter.mutation({
    name: 'Check Magic Link Status',
    description: 'Poll to check if magic link was verified (for cross-tab login)',
    path: '/check-magic-link-status',
    method: 'POST',
    body: checkMagicLinkStatusSchema,
    handler: async ({ request, response }) => {
      const { sessionId } = request.body;

      // Rate limiting — reuse auth rate limiter with unique prefix for polling
      const identifier = getClientIdentifier(request);
      const rateLimit = await authRateLimiter.check(`mlpoll:${identifier}`);
      if (!rateLimit.success) {
        return response.status(429).json({ error: 'Too many requests', retryAfter: rateLimit.retryAfter });
      }

      // C-3: Extract `mlpoll` cookie — the plain-text polling secret that was set
      // (httpOnly, path-scoped to this endpoint) when the OTP was issued. Only the
      // originating browser tab carries this cookie, binding the polling session to
      // the tab that initiated the login flow.
      const cookieHeader = (typeof (request.headers as any).get === 'function')
        ? ((request.headers as any).get('cookie') ?? '')
        : ((request.headers as any)['cookie'] ?? '');

      const mlpollCookie = cookieHeader
        .split(';')
        .map((c: string) => c.trim())
        .find((c: string) => c.startsWith('mlpoll='))
        ?.slice('mlpoll='.length);

      if (!mlpollCookie) {
        return response.status(403).json({ error: 'Forbidden' });
      }

      // Find the VerificationCode by ID
      const verificationCode = await db.verificationCode.findUnique({
        where: { id: sessionId },
      });

      if (!verificationCode) {
        return response.status(403).json({ error: 'Forbidden' });
      }

      // C-3: Constant-time comparison of the presented polling secret against
      // the stored SHA-256 hash. Prevents timing oracle attacks.
      // The `token` field stores the hash (no migration required — field is nullable String).
      if (!verificationCode.token) {
        // Legacy record without a polling secret — reject to fail secure
        return response.status(403).json({ error: 'Forbidden' });
      }
      const expectedHash = crypto
        .createHash('sha256')
        .update(mlpollCookie)
        .digest('hex');
      // timingSafeEqual requires same-length Buffers
      const expectedBuf = Buffer.from(expectedHash, 'utf8');
      const actualBuf = Buffer.from(verificationCode.token, 'utf8');
      const lengthMatch = expectedBuf.length === actualBuf.length;
      const secretMatch = lengthMatch && crypto.timingSafeEqual(expectedBuf, actualBuf);
      if (!secretMatch) {
        return response.status(403).json({ error: 'Forbidden' });
      }

      // Check if expired (5 minute polling timeout)
      if (verificationCode.expiresAt < new Date()) {
        return response.success({ verified: false, expired: true });
      }

      // Not yet verified — magic link hasn't been clicked
      if (!verificationCode.used) {
        return response.success({ verified: false, expired: false });
      }

      // Magic link WAS verified in another tab!
      // Now authenticate this tab too by issuing cookies.
      const user = await db.user.findUnique({
        where: { email: verificationCode.identifier },
        include: {
          organizations: {
            where: { isActive: true },
            include: { organization: true },
          },
        },
      });

      if (!user) {
        return response.status(404).json({ error: 'User not found' });
      }

      if (!user.isActive) {
        return response.status(403).json({ error: 'Account disabled' });
      }

      // If 2FA is enabled, the new tab already handled 2FA.
      // The original tab cannot bypass 2FA, so signal requiresTwoFactor
      // and let the original tab show the 2FA challenge.
      if (user.twoFactorEnabled) {
        const challengeId = sign2faChallenge(user.id);
        return response.success({ verified: true, requiresTwoFactor: true, challengeId });
      }

      let currentOrgId = user.currentOrgId;
      if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
        currentOrgId = user.organizations[0].organizationId;
        await db.user.update({
          where: { id: user.id },
          data: { currentOrgId },
        });
      }

      const currentOrgRelation = user.organizations.find(
        (org) => org.organizationId === currentOrgId,
      );

      // Issue full session (access + refresh) for this tab — same as login path
      await issueSession(response, {
        id: user.id,
        email: user.email,
        role: user.role as UserRole,
        currentOrgId,
        onboardingCompleted: user.onboardingCompleted,
      }, {
        organizationRole: currentOrgRelation?.role as any,
        accessTokenExpiry: '24h',
        refreshTokenExpiry: '7d',
      });

      // Register device session (non-blocking)
      await registerDeviceSession(user.id, request);

      // Determine redirect path (org auto-created on signup; onboarding flow removed)
      const redirectPath = '/';

      return response.success({
        verified: true,
        redirectPath,
        needsOnboarding: !user.onboardingCompleted,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          currentOrgId,
          organizationRole: currentOrgRelation?.role,
        },
      });
    },
  }),
};
