/**
 * Auth Email OTP — Login routes
 *
 * Actions:
 *   loginOTP        POST /login-otp        — send OTP + magic link (login or signup branch)
 *   verifyLoginOTP  POST /verify-login-otp — consume OTP, handle 2FA gate, issue session
 */

import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import crypto from 'crypto';
import { passwordlessOTPSchema, verifyPasswordlessOTPSchema } from '../auth.schemas';
import { turnstileProcedure } from '../procedures/turnstile.procedure';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { authRateLimiter, otpVerifyLoginRateLimiter } from '@/lib/rate-limit/rate-limiter';
import { checkOtpRateLimit } from '@/lib/rate-limit/otp-rate-limit';
import { generateOTPCode } from '@/lib/auth/bcrypt';
import { signMagicLinkToken } from '@/lib/auth/jwt';
import { UserRole, OrganizationRole } from '@/lib/auth/roles';
import { emailService } from '@/lib/email';
import {
  getClientIdentifier,
  isProduction,
  appBaseUrl,
} from '../_shared/helpers';
import { check2faAndIssueChallenge } from '../_shared/two-factor-gate';
import { finalizeLogin } from '../_shared/finalize-login';

// ---------------------------------------------------------------------------
// Internal helper: handles the "unknown email → auto-signup OTP" branch of loginOTP
// ---------------------------------------------------------------------------

async function sendSignupOtpForUnknownUser(
  email: string,
  response: any,
): Promise<{ sent: true; message: string; magicLinkSessionId: string }> {
  const signupOtpCode = generateOTPCode();
  const signupExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const tempName = email.split('@')[0];

  await db.tempUser.upsert({
    where: { email },
    create: { email, name: tempName, code: signupOtpCode, expiresAt: signupExpiresAt },
    update: { code: signupOtpCode, expiresAt: signupExpiresAt },
  });

  // C-3: Polling secret — SHA-256 hash stored in DB, plain text in httpOnly cookie
  const signupPollingSecret = crypto.randomBytes(32).toString('hex');
  const signupPollingSecretHash = crypto.createHash('sha256').update(signupPollingSecret).digest('hex');

  const signupVerificationCode = await db.verificationCode.create({
    data: {
      identifier: email,
      code: signupOtpCode,
      type: 'MAGIC_LINK',
      token: signupPollingSecretHash,
      expiresAt: signupExpiresAt,
      used: false,
    },
  });

  const signupMagicLinkToken = signMagicLinkToken({
    email,
    tokenId: signupVerificationCode.id,
    type: 'signup',
  });

  await emailService.sendWelcomeSignupEmail(
    email,
    tempName,
    signupOtpCode,
    `${appBaseUrl}/signup/verify-magic?token=${signupMagicLinkToken}`,
    10,
  );

  response.setCookie('mlpoll', signupPollingSecret, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict' as const,
    path: '/api/v1/auth/check-magic-link-status',
    maxAge: 600,
  });

  return { sent: true, message: 'Código enviado para seu email', magicLinkSessionId: signupVerificationCode.id };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const loginRoutes = {
  /**
   * Login OTP — Request passwordless login code (OTP + Magic Link).
   * Automatically routes new emails to the signup branch.
   */
  loginOTP: igniter.mutation({
    name: 'Login OTP',
    description: 'Request passwordless login code via email',
    path: '/login-otp',
    method: 'POST',
    body: passwordlessOTPSchema,
    use: [turnstileProcedure()],
    handler: async ({ request, response }) => {
      // Rate limiting (IP-only)
      const identifier = getClientIdentifier(request);
      const ipRateLimit = await authRateLimiter.check(identifier);
      if (!ipRateLimit.success) {
        return response.status(429).json({ error: 'Too many requests', retryAfter: ipRateLimit.retryAfter });
      }

      const { email } = request.body;

      // Per-email rate limit to prevent OTP spam to any address
      const emailOtpRateLimit = await checkOtpRateLimit(`send-login-otp:${email}`, identifier);
      if (!emailOtpRateLimit.success) {
        return response.status(429).json({
          error: 'Too many OTP requests for this email. Please wait before requesting a new code.',
          retryAfter: emailOtpRateLimit.retryAfter,
        });
      }

      const user = await db.user.findUnique({
        where: { email },
        include: { preferences: { select: { otpEmailDisabled: true } } },
      });

      // 2FA + OTP-disabled guard
      if (user && user.twoFactorEnabled && user.preferences?.otpEmailDisabled) {
        return response.status(403).json({
          error: 'OTP por email desabilitado. Use seu aplicativo autenticador para fazer login.',
          code: 'OTP_EMAIL_DISABLED',
        });
      }

      // Unknown email → auto-signup branch
      if (!user) {
        const payload = await sendSignupOtpForUnknownUser(email, response);
        return response.success(payload);
      }

      // Known user → login OTP branch
      const otpCode = generateOTPCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // C-3: Polling secret for tab binding
      const pollingSecret = crypto.randomBytes(32).toString('hex');
      const pollingSecretHash = crypto.createHash('sha256').update(pollingSecret).digest('hex');

      const verificationCode = await db.verificationCode.create({
        data: {
          userId: user.id,
          identifier: email,
          code: otpCode,
          type: 'MAGIC_LINK',
          token: pollingSecretHash,
          expiresAt,
          used: false,
        },
      });

      const magicLinkToken = signMagicLinkToken({ email, tokenId: verificationCode.id, type: 'login' });
      const magicLinkUrl = `${appBaseUrl}/login/verify-magic?token=${magicLinkToken}`;

      await emailService.sendLoginCodeEmail(user.email, user.name, otpCode, magicLinkUrl, 10);

      response.setCookie('mlpoll', pollingSecret, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict' as const,
        path: '/api/v1/auth/check-magic-link-status',
        maxAge: 600,
      });

      return response.success({ sent: true, message: 'Código enviado para seu email', magicLinkSessionId: verificationCode.id });
    },
  }),

  /**
   * Verify Login OTP — Validate OTP code, 2FA gate, issue session
   */
  verifyLoginOTP: igniter.mutation({
    name: 'Verify Login OTP',
    description: 'Verify passwordless OTP code',
    path: '/verify-login-otp',
    method: 'POST',
    body: verifyPasswordlessOTPSchema,
    use: [csrfProcedure()],
    handler: async ({ request, response }) => {
      const { email, code } = request.body;

      // Rate limit — 5 attempts / 10 min per IP+email
      const rlIdentifier = `${getClientIdentifier(request)}:${email}`;
      const rateLimit = await otpVerifyLoginRateLimiter.check(rlIdentifier);
      if (!rateLimit.success) {
        return response.status(429).json({ error: 'Too many attempts', retryAfter: rateLimit.retryAfter });
      }

      // Camada adicional de rate-limit por email
      const clientIp = getClientIdentifier(request);
      const otpRateLimit = await checkOtpRateLimit(`verify-login:${email}`, clientIp);
      if (!otpRateLimit.success) {
        return response.status(429).json({ error: 'Too many attempts', retryAfter: otpRateLimit.retryAfter });
      }

      const user = await db.user.findUnique({
        where: { email },
        include: {
          organizations: {
            where: { isActive: true },
            include: { organization: true },
          },
        },
      });

      if (!user) return response.status(400).json({ error: 'Invalid code' });

      // Atomic compare-and-set: consume token in a single UPDATE (prevents replay race)
      const consumed = await db.verificationCode.updateMany({
        where: { identifier: email, code, type: 'MAGIC_LINK', used: false, expiresAt: { gt: new Date() } },
        data: { used: true },
      });

      if (consumed.count === 0) return response.status(400).json({ error: 'Invalid or expired code' });
      if (!user.isActive) return response.status(403).json({ error: 'Account disabled' });

      // H-5: 2FA gate — issue challenge, caller finishes TOTP step
      const twoFactorGate = await check2faAndIssueChallenge(user, request, 'email-otp');
      if (twoFactorGate) return response.success(twoFactorGate);

      // Ensure admin has an org set
      let currentOrgId = user.currentOrgId;
      if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
        currentOrgId = user.organizations[0].organizationId;
        await db.user.update({ where: { id: user.id }, data: { currentOrgId } });
      }

      const currentOrgRelation = user.organizations.find((org) => org.organizationId === currentOrgId);

      // Device + session + audit — all-in-one happy path
      const result = await finalizeLogin({
        user: {
          id: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId,
          onboardingCompleted: user.onboardingCompleted,
        },
        request,
        response,
        method: 'email-otp',
        auditEvents: [
          { action: 'user.login', metadata: { email: user.email } },
          { action: 'auth.login', metadata: { email: user.email } },
        ],
        issueOptions: {
          organizationRole: currentOrgRelation?.role as OrganizationRole | undefined,
          accessTokenExpiry: '24h',
          refreshTokenExpiry: '7d',
        },
      });

      if (result.blocked) {
        return Response.json(
          { error: 'Login bloqueado por política de segurança. Contate o administrador.' },
          { status: 403 },
        );
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
    },
  }),
};
