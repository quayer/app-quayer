/**
 * Auth magic link flows
 *
 * Extraido do monolito auth.controller.ts. Contratos preservados.
 */

import { igniter } from "@/igniter";
import { database as db } from "@/server/services/database";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { z } from "zod";
import { verifyMagicLinkSchema, checkMagicLinkStatusSchema } from "../auth.schemas";
import { normalizePhone, sendWhatsAppOTP } from "@/lib/uaz/whatsapp-otp";
import { hashPassword, verifyPassword, generateOTPCode, generateRecoveryCodes } from "@/lib/auth/bcrypt";
import { signAccessToken, signRefreshToken, verifyRefreshToken, getExpirationDate, signMagicLinkToken, verifyMagicLinkToken } from "@/lib/auth/jwt";
import { authProcedure } from "../procedures/auth.procedure";
import { csrfProcedure } from "../procedures/csrf.procedure";
import { turnstileProcedure } from "../procedures/turnstile.procedure";
import { UserRole, OrganizationRole } from "@/lib/auth/roles";
import { emailService } from "@/lib/email";
import { authRateLimiter } from "@/lib/rate-limit/rate-limiter";
import { checkOtpRateLimit } from "@/lib/rate-limit/otp-rate-limit";
import { generateCsrfToken, setCsrfCookie, clearCsrfCookie } from "@/lib/auth/csrf";
import { getIpGeolocation } from "@/lib/geocoding/ip-geolocation";
import { encrypt, decrypt } from "@/lib/crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import {
  getClientIdentifier, createAuditLog, appBaseUrl, dashboardUrl, isProduction,
  setAuthCookies, clearAuthCookies, sign2faChallenge, verify2faChallenge,
  getChallengeAttempts, incrementChallengeAttempts, MAX_2FA_ATTEMPTS,
  parseDeviceName, registerDeviceSession, autoJoinByVerifiedDomain,
} from "../_shared/helpers";
import { isSignupEnabled, SIGNUP_DISABLED_MESSAGE } from "../_shared/signup-gate";

export const magicLinkController = igniter.controller({
  name: "auth-magic-link",
  path: "/auth",
  description: "Auth magic link flows",
  actions: {
    /**
     * Verify Magic Link - Validate magic link token and return tokens
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

        // Verificar token JWT (magic link)
        const payload = verifyMagicLinkToken(token);
        if (!payload) {
          return response.status(400).json({ error: 'Invalid or expired magic link' });
        }

        // Rate limit reinforcement — bound by email+IP now that we have the decoded token
        const rateLimitIdentifier = payload.email || identifier;
        const otpRateLimit = await checkOtpRateLimit(rateLimitIdentifier, identifier);
        if (!otpRateLimit.success) {
          return response.status(429).json({ error: 'Too many requests', retryAfter: otpRateLimit.retryAfter });
        }

        // Buscar verification code no banco
        const verificationCode = await db.verificationCode.findUnique({
          where: { id: payload.tokenId },
        });

        if (!verificationCode || verificationCode.used) {
          return response.status(400).json({ error: 'Magic link already used or expired' });
        }

        if (verificationCode.expiresAt < new Date()) {
          return response.status(400).json({ error: 'Magic link expired' });
        }

        // Marcar como usado
        await db.verificationCode.update({
          where: { id: verificationCode.id },
          data: { used: true },
        });

        // SIGNUP: Criar novo usuário
        if (payload.type === 'magic-link-signup') {
          // Signup gate — block new-user creation when SIGNUP_ENABLED=false
          if (!isSignupEnabled()) {
            return response.status(403).json({ error: SIGNUP_DISABLED_MESSAGE });
          }

          // Verificar se já existe
          const existingUser = await db.user.findUnique({ where: { email: payload.email } });
          if (existingUser) {
            return response.status(400).json({ error: 'Usuário já existe' });
          }

          // Buscar TempUser com o nome
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
              password: null, // Passwordless — OTP signup user
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

          await db.tempUser.delete({ where: { email: payload.email } });

          // Auto-join by verified domain (fail-open, non-blocking)
          await autoJoinByVerifiedDomain(user.id, user.email, request);

          const accessToken = signAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role as UserRole,
            currentOrgId: organization.id,
            organizationRole: OrganizationRole.MASTER,
            needsOnboarding: !user.onboardingCompleted, // ✅ Incluir no token para middleware (será false para novo signup)
          }, '24h');

          const refreshTokenData = await db.refreshToken.create({
            data: {
              userId: user.id,
              token: signRefreshToken({ userId: user.id, tokenId: '' }),
              expiresAt: getExpirationDate('7d'),
            },
          });

          const refreshToken = signRefreshToken({
            userId: user.id,
            tokenId: refreshTokenData.id,
          });

          await db.refreshToken.update({
            where: { id: refreshTokenData.id },
            data: { token: refreshToken },
          });

          await emailService.sendWelcomeEmail(user.email, user.name, dashboardUrl);

          // Set httpOnly cookies
          setAuthCookies(response, accessToken, refreshToken);

          // Register device session (non-blocking)
          await registerDeviceSession(user.id, request);

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

        // LOGIN: Autenticar usuário existente
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

          // 2FA check: if user has TOTP enabled, return challenge
          if (user.twoFactorEnabled) {
            const challengeId = sign2faChallenge(user.id);
            createAuditLog('2FA_CHALLENGE_ISSUED', user.id, request, { method: 'magic-link' }, user.currentOrgId);
            return response.success({ requiresTwoFactor: true, challengeId });
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
            (org) => org.organizationId === currentOrgId
          );

          const accessToken = signAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role as UserRole,
            currentOrgId,
            organizationRole: currentOrgRelation?.role as any,
            needsOnboarding: !user.onboardingCompleted, // ✅ Incluir no token para middleware
          }, '24h');

          const refreshTokenData = await db.refreshToken.create({
            data: {
              userId: user.id,
              token: signRefreshToken({ userId: user.id, tokenId: '' }),
              expiresAt: getExpirationDate('7d'),
            },
          });

          const refreshToken = signRefreshToken({
            userId: user.id,
            tokenId: refreshTokenData.id,
          });

          await db.refreshToken.update({
            where: { id: refreshTokenData.id },
            data: { token: refreshToken },
          });

          // Set httpOnly cookies
          setAuthCookies(response, accessToken, refreshToken);

          // Register device session (non-blocking)
          await registerDeviceSession(user.id, request);

          // Audit log — login via magic link
          await createAuditLog('auth.login', user.id, request, { method: 'magic-link' }, currentOrgId);

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

    /**
     * Check Magic Link Status — polling from original tab
     *
     * The original tab (OTP form) polls this endpoint every 3s to detect
     * when the magic link has been verified in another tab.
     * When verified, this endpoint issues auth cookies for the polling tab
     * so it can redirect to the dashboard.
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

        // Find the VerificationCode by ID
        const verificationCode = await db.verificationCode.findUnique({
          where: { id: sessionId },
        });

        if (!verificationCode) {
          return response.status(404).json({ error: 'Session not found' });
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
          (org) => org.organizationId === currentOrgId
        );

        // Issue tokens for this tab
        const accessToken = signAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId,
          organizationRole: currentOrgRelation?.role as any,
          needsOnboarding: !user.onboardingCompleted,
        }, '24h');

        const refreshTokenData = await db.refreshToken.create({
          data: {
            userId: user.id,
            token: signRefreshToken({ userId: user.id, tokenId: '' }),
            expiresAt: getExpirationDate('7d'),
          },
        });

        const refreshToken = signRefreshToken({
          userId: user.id,
          tokenId: refreshTokenData.id,
        });

        await db.refreshToken.update({
          where: { id: refreshTokenData.id },
          data: { token: refreshToken },
        });

        // Set httpOnly cookies for this tab
        setAuthCookies(response, accessToken, refreshToken);

        // Register device session (non-blocking)
        await registerDeviceSession(user.id, request);

        // Determine redirect path
        let redirectPath = '/projetos';
        if (!user.onboardingCompleted || !currentOrgId) {
          redirectPath = '/onboarding';
        } else if (user.role === 'admin') {
          redirectPath = '/admin';
        }

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

    /**
     * Complete Onboarding - Marcar onboarding como completo
     */
    completeOnboarding: igniter.mutation({
      name: 'CompleteOnboarding',
      description: 'Mark user onboarding as completed',
      path: '/onboarding/complete',
      method: 'POST',
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id;

        if (!userId) {
          return response.unauthorized('Authentication required');
        }

        const user = await db.user.findUnique({
          where: { id: userId },
          include: {
            organizations: {
              include: {
                organization: true,
              },
            },
          },
        });

        if (!user) {
          return response.notFound('User not found');
        }

        // Verificar se usuário tem organização
        if (user.organizations.length === 0) {
          return response.badRequest(
            'Cannot complete onboarding without an organization'
          );
        }

        // Marcar onboarding como completo
        const currentOrgId = user.currentOrgId || user.organizations[0].organizationId;
        const updatedUser = await db.user.update({
          where: { id: userId },
          data: {
            onboardingCompleted: true,
            currentOrgId,
          },
        });

        // Emitir novo JWT com needsOnboarding: false para que o middleware deixe o usuário passar
        const currentOrgRelation = user.organizations.find(
          (org) => org.organizationId === currentOrgId
        );
        const newAccessToken = signAccessToken({
          userId: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role as UserRole,
          currentOrgId,
          organizationRole: currentOrgRelation?.role as any,
          needsOnboarding: false,
        });
        setAuthCookies(response, newAccessToken);

        // Audit log — onboarding completed
        await createAuditLog('auth.onboarding_complete', updatedUser.id, request, {}, currentOrgId);

        return response.success({
          message: 'Onboarding completed successfully',
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            onboardingCompleted: updatedUser.onboardingCompleted,
            currentOrgId,
          },
        });
      },
    }),
  },
});
