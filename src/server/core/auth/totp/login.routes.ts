/**
 * TOTP Login Routes
 *
 * Actions:
 *   POST /auth/2fa/verify — (H-5) completa login 2FA apos primeiro fator
 *
 * Usa `issueSession` para emitir access+refresh+cookies apos validar o
 * challenge JWT de 2FA e o codigo TOTP (ou recovery code).
 */

import { z } from 'zod';
import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import { verifyPassword } from '@/lib/auth/bcrypt';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { RateLimiter } from '@/lib/rate-limit/rate-limiter';
import { issueSession } from '../_shared/issue-session';
import {
  getClientIdentifier,
  createAuditLog,
  registerDeviceSession,
  verify2faChallenge,
  getChallengeAttempts,
  incrementChallengeAttempts,
  clearChallengeAttempts,
  MAX_2FA_ATTEMPTS,
} from '../_shared/helpers';
import { verifyTotpCode } from './totp.helpers';

// ── Rate limiters ──────────────────────────────────────────────────────────────
// H-5: 5 attempts per 5-min window per IP — same as challenge attempts Redis cap (MAX_2FA_ATTEMPTS)
const twoFaLoginVerifyLimiter = new RateLimiter({ limit: 5, window: 300, prefix: '2fa-login-verify', failClosedInProduction: true });

// ── Routes ─────────────────────────────────────────────────────────────────────
export const loginRoutes = {

  // ── POST /auth/2fa/verify ──────────────────────────────────────────────────
  twoFactorLoginVerify: igniter.mutation({
    name: '2FA Login Verify',
    description: 'Complete login after first factor by verifying TOTP code or recovery code (H-5)',
    path: '/2fa/verify',
    method: 'POST',
    use: [csrfProcedure()],
    body: z.object({
      challengeId: z.string().min(1),
      code: z.string().min(6).max(10), // 6-digit TOTP or recovery code (longer)
    }),
    handler: async ({ request, response }) => {
      const clientIp = getClientIdentifier(request);
      const rl = await twoFaLoginVerifyLimiter.check(clientIp);
      if (!rl.success) {
        return response.status(429).json({ error: 'Too many attempts', retryAfter: rl.retryAfter });
      }

      const { challengeId, code } = request.body;

      // ── 1. Verify the 2FA challenge JWT ─────────────────────────────────────
      const challengePayload = verify2faChallenge(challengeId);
      if (!challengePayload) {
        return response.status(401).json({ error: 'Invalid or expired 2FA challenge' });
      }

      const { userId } = challengePayload;

      // ── 2. Enforce per-challenge attempt cap (Redis) ─────────────────────────
      const attempts = await getChallengeAttempts(challengeId);
      if (attempts >= MAX_2FA_ATTEMPTS) {
        return response.status(429).json({ error: 'Too many 2FA attempts. Please start over.' });
      }

      // ── 3. Fetch user + active TOTP device ──────────────────────────────────
      const user = await db.user.findUnique({
        where: { id: userId },
        include: {
          organizations: {
            where: { isActive: true },
            include: { organization: true },
          },
        },
      });

      if (!user || !user.isActive) {
        return response.status(401).json({ error: 'Authentication failed' });
      }

      if (!user.twoFactorEnabled) {
        // 2FA was disabled between challenge issue and verify — fail secure
        return response.status(401).json({ error: 'Authentication failed' });
      }

      // ── 4. Try TOTP code first ───────────────────────────────────────────────
      const device = await db.totpDevice.findFirst({
        where: { userId: user.id, verified: true },
      });

      let authenticated = false;
      let usedRecoveryCode = false;

      if (device && verifyTotpCode(device.secret, code)) {
        authenticated = true;
      }

      // ── 5. If TOTP fails, try recovery codes ────────────────────────────────
      if (!authenticated) {
        const recoveryCodes = await db.recoveryCode.findMany({
          where: { userId: user.id, usedAt: null },
        });

        for (const rc of recoveryCodes) {
          const isMatch = await verifyPassword(code, rc.code);
          if (isMatch) {
            // Mark recovery code as used (one-time)
            await db.recoveryCode.update({
              where: { id: rc.id },
              data: { usedAt: new Date() },
            });
            authenticated = true;
            usedRecoveryCode = true;
            break;
          }
        }
      }

      if (!authenticated) {
        await incrementChallengeAttempts(challengeId);
        return response.status(401).json({ error: 'Invalid 2FA code' });
      }

      // ── 6. Issue auth session ────────────────────────────────────────────────
      await clearChallengeAttempts(challengeId);

      let currentOrgId = user.currentOrgId;
      if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
        currentOrgId = user.organizations[0].organizationId;
        await db.user.update({
          where: { id: user.id },
          data: { currentOrgId },
        });
      }

      const currentOrgRelation = user.organizations.find(
        (org) => org.organizationId === currentOrgId
      );

      // Register device session + geo check BEFORE issuing tokens
      const deviceResult = await registerDeviceSession(user.id, request);
      if (deviceResult.blocked) {
        return Response.json(
          { error: 'Login bloqueado por politica de seguranca. Contate o administrador.' },
          { status: 403 }
        );
      }

      await issueSession(response, {
        id: user.id,
        email: user.email,
        role: user.role,
        currentOrgId,
        onboardingCompleted: user.onboardingCompleted,
      }, {
        organizationRole: currentOrgRelation?.role as any,
      });

      await createAuditLog('auth.login', user.id, request, {
        method: 'totp-2fa',
        usedRecoveryCode,
      }, currentOrgId);

      return response.success({
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
