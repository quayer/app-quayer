/**
 * Auth Email OTP — Signup routes
 *
 * Actions:
 *   signupOTP        POST /signup-otp        — send OTP + magic link to new user
 *   verifySignupOTP  POST /verify-signup-otp — consume OTP, create user, issue session
 */

import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import crypto from 'crypto';
import { signupOTPSchema, verifySignupOTPSchema } from '../auth.schemas';
import { turnstileProcedure } from '../procedures/turnstile.procedure';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { authRateLimiter, otpVerifySignupRateLimiter } from '@/lib/rate-limit/rate-limiter';
import { checkOtpRateLimit } from '@/lib/rate-limit/otp-rate-limit';
import { generateOTPCode } from '@/lib/auth/bcrypt';
import { signMagicLinkToken } from '@/lib/auth/jwt';
import { UserRole, OrganizationRole } from '@/lib/auth/roles';
import { emailService } from '@/lib/email';
import {
  getClientIdentifier,
  createAuditLog,
  appBaseUrl,
  dashboardUrl,
  autoJoinByVerifiedDomain,
} from '../_shared/helpers';
import { issueSession } from '../_shared/issue-session';
import { isSignupEnabled, SIGNUP_DISABLED_MESSAGE } from '../_shared/signup-gate';

export const signupRoutes = {
  /**
   * Signup OTP — Request signup code (NEW USER)
   */
  signupOTP: igniter.mutation({
    name: 'Signup OTP',
    description: 'Request signup code via email',
    path: '/signup-otp',
    method: 'POST',
    body: signupOTPSchema,
    use: [turnstileProcedure()],
    handler: async ({ request, response }) => {
      if (!isSignupEnabled()) {
        return response.status(403).json({ error: SIGNUP_DISABLED_MESSAGE });
      }

      const identifier = getClientIdentifier(request);
      const rateLimit = await authRateLimiter.check(identifier);

      if (!rateLimit.success) {
        return response.status(429).json({
          error: 'Too many requests',
          retryAfter: rateLimit.retryAfter,
        });
      }

      const { email, name } = request.body;

      // Check if user already exists
      const existingUser = await db.user.findUnique({ where: { email } });
      if (existingUser) {
        return response.success({ sent: true, message: 'Se este email não estiver cadastrado, um código será enviado.' });
      }

      // Generate OTP
      const otpCode = generateOTPCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // Save to TempUser (temporary storage before verification)
      await db.tempUser.upsert({
        where: { email },
        create: { email, name, code: otpCode, expiresAt },
        update: { name, code: otpCode, expiresAt },
      });

      // Create VerificationCode record for magic link
      const verificationCode = await db.verificationCode.create({
        data: {
          identifier: email,
          code: otpCode,
          type: 'MAGIC_LINK',
          expiresAt,
          used: false,
        },
      });

      // Generate magic link with secure JWT
      const magicLinkToken = signMagicLinkToken({
        email,
        tokenId: verificationCode.id,
        type: 'signup',
        name,
      });

      const magicLinkUrl = `${appBaseUrl}/signup/verify-magic?token=${magicLinkToken}`;

      // Send WELCOME email (first time user)
      await emailService.sendWelcomeSignupEmail(email, name, otpCode, magicLinkUrl, 10);

      return response.success({ sent: true, message: 'Código enviado para seu email' });
    },
  }),

  /**
   * Verify Signup OTP — Create user and issue session
   */
  verifySignupOTP: igniter.mutation({
    name: 'Verify Signup OTP',
    description: 'Verify signup OTP and create user',
    path: '/verify-signup-otp',
    method: 'POST',
    body: verifySignupOTPSchema,
    use: [csrfProcedure()],
    handler: async ({ request, response }) => {
      if (!isSignupEnabled()) {
        return response.status(403).json({ error: SIGNUP_DISABLED_MESSAGE });
      }

      const { email, code } = request.body;

      // Rate limit (brute-force protection) — 5 tentativas / 10 min por IP+email
      const rlIdentifier = `${getClientIdentifier(request)}:${email}`;
      const rateLimit = await otpVerifySignupRateLimiter.check(rlIdentifier);
      if (!rateLimit.success) {
        return response.status(429).json({
          error: 'Too many attempts',
          retryAfter: rateLimit.retryAfter,
        });
      }

      // Camada adicional de rate-limit (phone/IP helper, identificador por email)
      const clientIp = getClientIdentifier(request);
      const otpRateLimit = await checkOtpRateLimit(`verify-signup:${email}`, clientIp);
      if (!otpRateLimit.success) {
        return response.status(429).json({
          error: 'Too many attempts',
          retryAfter: otpRateLimit.retryAfter,
        });
      }

      const tempUser = await db.tempUser.findUnique({ where: { email } });

      if (!tempUser || tempUser.code !== code) {
        return response.status(400).json({ error: 'Código inválido' });
      }

      if (tempUser.expiresAt < new Date()) {
        return response.status(400).json({ error: 'Código expirado' });
      }

      const existingUser = await db.user.findUnique({ where: { email } });
      if (existingUser) {
        return response.status(400).json({ error: 'Código inválido' });
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
          password: null, // Passwordless — magic link user
          role: isFirstUser ? UserRole.ADMIN : UserRole.USER,
          emailVerified: new Date(),
          currentOrgId: organization.id,
          organizations: {
            create: {
              organizationId: organization.id,
              role: 'master',
            },
          },
        },
      });

      await db.tempUser.delete({ where: { email } });

      // Auto-join by verified domain (fail-open, non-blocking)
      await autoJoinByVerifiedDomain(user.id, user.email, request);

      // Issue full authenticated session (access + refresh JWT + httpOnly cookies).
      await issueSession(response, {
        id: user.id,
        email: user.email,
        role: user.role,
        currentOrgId: organization.id,
        onboardingCompleted: user.onboardingCompleted,
      }, {
        organizationRole: OrganizationRole.MASTER,
        accessTokenExpiry: '24h',
        refreshTokenExpiry: '7d',
      });

      await emailService.sendWelcomeEmail(user.email, user.name, dashboardUrl);

      // Audit logs (fail-open)
      await createAuditLog('user.signup', user.id, request, { email: user.email, method: 'email-otp' }, organization.id);
      await createAuditLog('auth.signup', user.id, request, { email: user.email, method: 'email-otp' }, organization.id);

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
    },
  }),
};
