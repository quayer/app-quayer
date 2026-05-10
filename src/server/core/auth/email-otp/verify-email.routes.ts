/**
 * Auth Email OTP — Verify Email routes
 *
 * Action: verifyEmail (POST /verify-email)
 * Validates an email verification code, marks the email as verified,
 * auto-joins by verified domain, and issues a full authenticated session.
 */

import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import { verifyEmailCodeSchema } from '../auth.schemas';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { otpVerifyEmailRateLimiter } from '@/lib/rate-limit/rate-limiter';
import {
  getClientIdentifier,
  createAuditLog,
  autoJoinByVerifiedDomain,
} from '../_shared/helpers';
import { issueSession } from '../_shared/issue-session';

export const verifyEmailRoutes = {
  verifyEmail: igniter.mutation({
    name: 'Verify Email',
    description: 'Verify email with code',
    path: '/verify-email',
    method: 'POST',
    body: verifyEmailCodeSchema,
    use: [csrfProcedure()],
    handler: async ({ request, response }) => {
      const { email, code } = request.body;

      // Rate limit (brute-force protection) — 5 tentativas / 10 min por IP+email
      const rlIdentifier = `${getClientIdentifier(request)}:${email}`;
      const rateLimit = await otpVerifyEmailRateLimiter.check(rlIdentifier);
      if (!rateLimit.success) {
        return response.status(429).json({
          error: 'Too many attempts',
          retryAfter: rateLimit.retryAfter,
        });
      }

      const user = await db.user.findUnique({ where: { email } });

      if (!user) {
        return response.status(400).json({ error: 'Invalid code' });
      }

      if (user.emailVerified) {
        return response.status(400).json({ error: 'Email already verified' });
      }

      // Atomic compare-and-set: consume the token in a single UPDATE.
      // Prevents race-condition token replay where two concurrent requests
      // both read used=false before either writes used=true.
      const emailVerificationResult = await db.verificationCode.updateMany({
        where: {
          identifier: email,
          code,
          type: 'EMAIL_VERIFICATION',
          used: false,
          expiresAt: { gt: new Date() },
        },
        data: { used: true },
      });

      if (emailVerificationResult.count === 0) {
        return response.status(400).json({ error: 'Invalid or expired code' });
      }

      await db.user.update({
        where: { email },
        data: { emailVerified: new Date() },
      });

      // Auto-join by verified domain (fail-open)
      await autoJoinByVerifiedDomain(user.id, user.email, request);

      // Issue full authenticated session (access + refresh JWT + httpOnly cookies).
      // Uses Pattern A (create placeholder → re-sign with tokenId) — more correct
      // than the previous inline block that used tokenId:''.
      await issueSession(response, {
        id: user.id,
        email: user.email,
        role: user.role,
        currentOrgId: user.currentOrgId,
        onboardingCompleted: user.onboardingCompleted,
      }, { refreshTokenExpiry: '30d' });

      // Audit log (fail-open)
      await createAuditLog(
        'user.email_verified',
        user.id,
        request,
        { email: user.email },
        user.currentOrgId,
      );

      return response.success({
        verified: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    },
  }),
};
