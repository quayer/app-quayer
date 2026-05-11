/**
 * Magic Link — Verify Routes
 *
 * Expõe a action `verifyMagicLink`: consome o token JWT do magic link e
 * executa o fluxo de signup ou login dependendo do `payload.type`.
 *
 * Signup path  → cria Organization + User + TempUser cleanup + issueSession
 * Login  path  → check2faAndIssueChallenge → finalizeLogin
 *
 * Contratos preservados (paths, shapes de response, nomes de action).
 */

import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import crypto from 'crypto';
import { verifyMagicLinkSchema } from '../auth.schemas';
import { checkOtpRateLimit } from '@/lib/rate-limit/otp-rate-limit';
import { UserRole, OrganizationRole } from '@/lib/auth/roles';
import { emailService } from '@/lib/email';
import { authRateLimiter } from '@/lib/rate-limit/rate-limiter';
import { verifyMagicLinkToken } from '@/lib/auth/jwt';
import {
  getClientIdentifier,
  createAuditLog,
  dashboardUrl,
  registerDeviceSession,
  autoJoinByVerifiedDomain,
} from '../_shared/helpers';
import { issueSession } from '../_shared/issue-session';
import { check2faAndIssueChallenge } from '../_shared/two-factor-gate';
import { finalizeLogin } from '../_shared/finalize-login';
import { isSignupEnabled, SIGNUP_DISABLED_MESSAGE } from '../_shared/signup-gate';

export const verifyRoutes = {
  /**
   * POST /auth/verify-magic-link
   *
   * Validate magic link token (login or signup).
   * Rate-limited by IP (pre-decode) and by email+IP (post-decode, via checkOtpRateLimit).
   */
  verifyMagicLink: igniter.mutation({
    name: 'Verify Magic Link',
    description: 'Verify magic link token (login or signup)',
    path: '/verify-magic-link',
    method: 'POST',
    body: verifyMagicLinkSchema,
    handler: async ({ request, response }) => {
      // Rate limit — prevent brute-forcing magic link tokens (IP-based, pre-decode)
      const identifier = getClientIdentifier(request);
      const rateLimit = await authRateLimiter.check(`verify-magic:${identifier}`);
      if (!rateLimit.success) {
        return response.status(429).json({ error: 'Too many requests', retryAfter: rateLimit.retryAfter });
      }

      const { token } = request.body;

      // Decode and validate the magic-link JWT
      const payload = verifyMagicLinkToken(token);
      if (!payload) {
        return response.status(400).json({ error: 'Invalid or expired magic link' });
      }

      // Secondary rate limit: bound by email+IP after we have the decoded payload
      const rateLimitIdentifier = payload.email || identifier;
      const otpRateLimit = await checkOtpRateLimit(rateLimitIdentifier, identifier);
      if (!otpRateLimit.success) {
        return response.status(429).json({ error: 'Too many requests', retryAfter: otpRateLimit.retryAfter });
      }

      // Atomic compare-and-set: consume the magic link token in a single UPDATE.
      // Prevents race-condition token replay where two concurrent requests
      // both read used=false before either writes used=true.
      const consumeResult = await db.verificationCode.updateMany({
        where: {
          id: payload.tokenId,
          used: false,
          expiresAt: { gt: new Date() },
        },
        data: { used: true },
      });

      if (consumeResult.count === 0) {
        // Re-check to give a more specific error without leaking token state
        const existing = await db.verificationCode.findUnique({
          where: { id: payload.tokenId },
          select: { used: true, expiresAt: true },
        });
        if (!existing) {
          return response.status(400).json({ error: 'Magic link already used or expired' });
        }
        if (existing.expiresAt < new Date()) {
          return response.status(400).json({ error: 'Magic link expired' });
        }
        return response.status(400).json({ error: 'Magic link already used or expired' });
      }

      // -----------------------------------------------------------------------
      // SIGNUP PATH: create org + user from TempUser
      // -----------------------------------------------------------------------
      if (payload.type === 'magic-link-signup') {
        // Signup gate — block new-user creation when SIGNUP_ENABLED=false
        if (!isSignupEnabled()) {
          return response.status(403).json({ error: SIGNUP_DISABLED_MESSAGE });
        }

        const existingUser = await db.user.findUnique({ where: { email: payload.email } });
        if (existingUser) {
          return response.status(400).json({ error: 'Usuário já existe' });
        }

        const tempUser = await db.tempUser.findUnique({ where: { email: payload.email } });
        if (!tempUser) {
          return response.status(400).json({ error: 'Signup data not found' });
        }

        const usersCount = await db.user.count();
        const isFirstUser = usersCount === 0;

        const slug = tempUser.name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50);
        const uniqueDocument = crypto.randomUUID().replace(/-/g, '').substring(0, 14);

        const organization = await db.organization.create({
          data: {
            name: `${tempUser.name}'s Organization`,
            slug: `${slug}-${Date.now()}`,
            document: uniqueDocument,
            type: 'pf',
            isActive: true,
          },
        });

        const user = await db.user.create({
          data: {
            email: tempUser.email,
            name: tempUser.name,
            password: null, // Passwordless — magic-link signup user
            role: isFirstUser ? UserRole.ADMIN : UserRole.USER,
            emailVerified: new Date(),
            onboardingCompleted: true,
            currentOrgId: organization.id,
            organizations: {
              create: {
                organizationId: organization.id,
                role: 'master',
              },
            },
          },
        });

        await db.tempUser.delete({ where: { email: payload.email } });

        // Auto-join by verified domain (fail-open, non-blocking)
        await autoJoinByVerifiedDomain(user.id, user.email, request);

        // Issue session (access + refresh tokens + cookies)
        await issueSession(response, {
          id: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId: organization.id,
          onboardingCompleted: user.onboardingCompleted,
        }, {
          organizationRole: OrganizationRole.MASTER,
          accessTokenExpiry: '24h',
          refreshTokenExpiry: '7d',
        });

        // Register device session (non-blocking)
        await registerDeviceSession(user.id, request);

        await emailService.sendWelcomeEmail(user.email, user.name, dashboardUrl);

        // Audit log — signup via magic link
        await createAuditLog('auth.signup', user.id, request, { method: 'magic-link' }, organization.id);

        return response.success({
          needsOnboarding: !user.onboardingCompleted,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            currentOrgId: organization.id,
            organizationRole: 'master',
          },
        });
      }

      // -----------------------------------------------------------------------
      // LOGIN PATH: authenticate existing user
      // -----------------------------------------------------------------------
      if (payload.type === 'magic-link-login') {
        const user = await db.user.findUnique({
          where: { email: payload.email },
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

        // 2FA gate: if TOTP is enabled, return challenge before issuing session
        const twoFaChallenge = await check2faAndIssueChallenge(user, request, 'magic-link');
        if (twoFaChallenge) {
          return response.success(twoFaChallenge);
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

        const loginResult = await finalizeLogin({
          user: {
            id: user.id,
            email: user.email,
            role: user.role as UserRole,
            currentOrgId,
            onboardingCompleted: user.onboardingCompleted,
          },
          request,
          response,
          method: 'magic-link',
          auditEvents: [{ action: 'auth.login' }],
          issueOptions: {
            organizationRole: currentOrgRelation?.role as any,
            accessTokenExpiry: '24h',
            refreshTokenExpiry: '7d',
          },
        });

        if (loginResult.blocked) {
          return response.status(403).json({ error: 'Login blocked by security policy' });
        }

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
      }

      return response.status(400).json({ error: 'Invalid magic link type' });
    },
  }),
};
