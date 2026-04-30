/**
 * Auth email OTP flows
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
import {
  verifyEmailCodeSchema,
  passwordlessOTPSchema, verifyPasswordlessOTPSchema,
  signupOTPSchema, verifySignupOTPSchema,
} from "../auth.schemas";
import { normalizePhone, sendWhatsAppOTP } from "@/lib/uaz/whatsapp-otp";
import { hashPassword, verifyPassword, generateOTPCode, generateRecoveryCodes } from "@/lib/auth/bcrypt";
import { signAccessToken, signRefreshToken, verifyRefreshToken, getExpirationDate, signMagicLinkToken, verifyMagicLinkToken } from "@/lib/auth/jwt";
import { authProcedure } from "../procedures/auth.procedure";
import { csrfProcedure } from "../procedures/csrf.procedure";
import { turnstileProcedure } from "../procedures/turnstile.procedure";
import { UserRole, OrganizationRole } from "@/lib/auth/roles";
import { emailService } from "@/lib/email";
import {
  authRateLimiter,
  otpVerifyEmailRateLimiter,
  otpVerifySignupRateLimiter,
  otpVerifyLoginRateLimiter,
} from "@/lib/rate-limit/rate-limiter";
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

export const emailOtpController = igniter.controller({
  name: "auth-email-otp",
  path: "/auth",
  description: "Auth email OTP flows",
  actions: {
    /**
     * Verify Email - Verificar código de email
     */
    verifyEmail: igniter.mutation({
      name: 'Verify Email',
      description: 'Verify email with code',
      path: '/verify-email',
      method: 'POST',
      body: verifyEmailCodeSchema,
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

        // Verificar código via VerificationCode
        const emailVerification = await db.verificationCode.findFirst({
          where: {
            identifier: email,
            code,
            type: 'EMAIL_VERIFICATION',
            used: false,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!emailVerification) {
          return response.status(400).json({ error: 'Invalid or expired code' });
        }

        // Marcar código como usado e email como verificado
        await db.verificationCode.update({
          where: { id: emailVerification.id },
          data: { used: true },
        });
        await db.user.update({
          where: { email },
          data: { emailVerified: new Date() },
        });

        // Auto-join by verified domain (fail-open)
        await autoJoinByVerifiedDomain(user.id, user.email, request);

        // Gerar tokens JWT
        const accessToken = await signAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role as UserRole,
          needsOnboarding: !user.onboardingCompleted, // ✅ Incluir no token para middleware
        });

        const refreshToken = await signRefreshToken({
          userId: user.id,
          tokenId: '',
        });

        // Salvar refresh token
        await db.refreshToken.create({
          data: {
            userId: user.id,
            token: refreshToken,
            expiresAt: getExpirationDate('30d'),
          },
        });

        // Set httpOnly cookies
        setAuthCookies(response, accessToken, refreshToken);

        // Audit log (fail-open)
        await createAuditLog('user.email_verified', user.id, request, { email: user.email }, user.currentOrgId);

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

    /**
     * Signup OTP - Request signup code (NEW USER)
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
          return response.status(400).json({ error: 'Email já cadastrado. Faça login.' });
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
     * Verify Signup OTP - Create user
     */
    verifySignupOTP: igniter.mutation({
      name: 'Verify Signup OTP',
      description: 'Verify signup OTP and create user',
      path: '/verify-signup-otp',
      method: 'POST',
      body: verifySignupOTPSchema,
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
          return response.status(400).json({ error: 'Usuário já existe' });
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

        // Audit log (fail-open)
        await createAuditLog('user.signup', user.id, request, { email: user.email, method: 'email-otp' }, organization.id);
        await createAuditLog('auth.signup', user.id, request, { email: user.email, method: 'email-otp' }, organization.id);

        return response.success({
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

    /**
     * Login OTP - Request passwordless login code (OTP + Magic Link)
     */
    loginOTP: igniter.mutation({
      name: 'Login OTP',
      description: 'Request passwordless login code via email',
      path: '/login-otp',
      method: 'POST',
      body: passwordlessOTPSchema,
      use: [turnstileProcedure()],
      handler: async ({ request, response }) => {
        // Rate limiting
        const identifier = getClientIdentifier(request);
        const rateLimit = await authRateLimiter.check(identifier);

        if (!rateLimit.success) {
          return response.status(429).json({
            error: 'Too many requests',
            retryAfter: rateLimit.retryAfter,
          });
        }

        const { email } = request.body;

        // Buscar usuário
        const user = await db.user.findUnique({ where: { email } });

        // 🚀 NOVO: Se usuário não existe, enviar OTP de SIGNUP automaticamente
        if (!user) {
          const signupOtpCode = generateOTPCode();
          const signupExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
          const tempName = email.split('@')[0]; // Extract name from email

          // Salvar em TempUser para signup
          await db.tempUser.upsert({
            where: { email },
            create: { email, name: tempName, code: signupOtpCode, expiresAt: signupExpiresAt },
            update: { code: signupOtpCode, expiresAt: signupExpiresAt },
          });

          // Criar VerificationCode para magic link de signup
          const signupVerificationCode = await db.verificationCode.create({
            data: {
              identifier: email,
              code: signupOtpCode,
              type: 'MAGIC_LINK',
              expiresAt: signupExpiresAt,
              used: false,
            },
          });

          // Gerar magic link para signup
          const signupMagicLinkToken = signMagicLinkToken({
            email,
            tokenId: signupVerificationCode.id,
            type: 'signup',
          });

          const signupMagicLinkUrl = `${appBaseUrl}/signup/verify-magic?token=${signupMagicLinkToken}`;

          // Enviar email de SIGNUP (boas-vindas)
          await emailService.sendWelcomeSignupEmail(
            email,
            email.split('@')[0], // Nome temporário a partir do email
            signupOtpCode,
            signupMagicLinkUrl,
            10
          );

          return response.success({
            sent: true,
            isNewUser: true,
            message: 'Código de cadastro enviado para seu email',
            magicLinkSessionId: signupVerificationCode.id,
          });
        }

        // Gerar código OTP de 6 dígitos para LOGIN
        const otpCode = generateOTPCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

        // Create VerificationCode record for magic link
        const verificationCode = await db.verificationCode.create({
          data: {
            userId: user.id,
            identifier: email,
            code: otpCode,
            type: 'MAGIC_LINK',
            expiresAt,
            used: false,
          },
        });

        // Gerar magic link JWT seguro (válido por 10 minutos)
        const magicLinkToken = signMagicLinkToken({
          email,
          tokenId: verificationCode.id,
          type: 'login',
        });

        // Gerar URL completa do magic link
        const magicLinkUrl = `${appBaseUrl}/login/verify-magic?token=${magicLinkToken}`;

        // Enviar email com AMBOS: código OTP e magic link (Vercel pattern)
        await emailService.sendLoginCodeEmail(
          user.email,
          user.name,
          otpCode,
          magicLinkUrl,
          10
        );

        return response.success({
          sent: true,
          message: 'Login code sent to your email',
          magicLinkSessionId: verificationCode.id,
        });
      },
    }),

    /**
     * Verify Login OTP - Validate OTP code and return tokens
     */
    verifyLoginOTP: igniter.mutation({
      name: 'Verify Login OTP',
      description: 'Verify passwordless OTP code',
      path: '/verify-login-otp',
      method: 'POST',
      body: verifyPasswordlessOTPSchema,
      handler: async ({ request, response }) => {
        const { email, code } = request.body;

        // Rate limit (brute-force protection) — 5 tentativas / 10 min por IP+email
        const rlIdentifier = `${getClientIdentifier(request)}:${email}`;
        const rateLimit = await otpVerifyLoginRateLimiter.check(rlIdentifier);
        if (!rateLimit.success) {
          return response.status(429).json({
            error: 'Too many attempts',
            retryAfter: rateLimit.retryAfter,
          });
        }

        // Camada adicional de rate-limit (phone/IP helper, identificador por email)
        const clientIp = getClientIdentifier(request);
        const otpRateLimit = await checkOtpRateLimit(`verify-login:${email}`, clientIp);
        if (!otpRateLimit.success) {
          return response.status(429).json({
            error: 'Too many attempts',
            retryAfter: otpRateLimit.retryAfter,
          });
        }

        // Buscar usuário
        const user = await db.user.findUnique({
          where: { email },
          include: {
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
          },
        });

        if (!user) {
          return response.status(400).json({ error: 'Invalid code' });
        }

        // Verificar código via VerificationCode
        const loginVerification = await db.verificationCode.findFirst({
          where: {
            identifier: email,
            code,
            type: 'MAGIC_LINK',
            used: false,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!loginVerification) {
          return response.status(400).json({ error: 'Invalid or expired code' });
        }

        // Verificar se usuário está ativo
        if (!user.isActive) {
          return response.status(403).json({ error: 'Account disabled' });
        }

        // Marcar código como usado
        await db.verificationCode.update({
          where: { id: loginVerification.id },
          data: { used: true },
        });

        // Se admin não tem org setada, setar primeira org disponível
        let currentOrgId = user.currentOrgId;
        if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
          currentOrgId = user.organizations[0].organizationId;
          await db.user.update({
            where: { id: user.id },
            data: { currentOrgId },
          });
        }

        // Obter role na organização atual
        const currentOrgRelation = user.organizations.find(
          (org) => org.organizationId === currentOrgId
        );

        // Criar access token (24h conforme especificação)
        const accessToken = signAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId,
          organizationRole: currentOrgRelation?.role as any,
          needsOnboarding: !user.onboardingCompleted, // ✅ Incluir no token para middleware
        }, '24h');

        // Criar refresh token (7 dias)
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

        // Register device session + geo check BEFORE setting cookies
        const deviceResult = await registerDeviceSession(user.id, request);
        if (deviceResult.blocked) {
          return Response.json(
            { error: 'Login bloqueado por política de segurança. Contate o administrador.' },
            { status: 403 }
          );
        }

        // Set httpOnly cookies — only after device check passes
        setAuthCookies(response, accessToken, refreshToken);

        // Audit log (fail-open)
        await createAuditLog('user.login', user.id, request, { email: user.email, method: 'email-otp' }, currentOrgId);
        await createAuditLog('auth.login', user.id, request, { email: user.email, method: 'email-otp' }, currentOrgId);

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
  },
});
