/**
 * Auth TOTP/2FA flows
 *
 * Endpoints:
 *   POST /auth/totp/setup              — gera secret + QR code, cria TotpDevice pendente
 *   POST /auth/totp/verify             — verifica código TOTP e ativa o device
 *   GET  /auth/totp/devices            — lista devices ativos do usuário
 *   POST /auth/totp/disable-request    — envia email com código para desativar
 *   POST /auth/totp/disable            — desativa 2FA (requer emailCode + totpCode)
 *   POST /auth/totp/regenerate-codes   — regenera recovery codes
 *   POST /auth/2fa/verify              — (H-5) completa login 2FA após primeiro fator
 */

import { igniter } from "@/igniter";
import { database as db } from "@/server/services/database";
import crypto from "crypto";
import { z } from "zod";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { hashPassword, verifyPassword, generateRecoveryCodes } from "@/lib/auth/bcrypt";
import { authProcedure } from "../procedures/auth.procedure";
import { csrfProcedure } from "../procedures/csrf.procedure";
import { emailService } from "@/lib/email";
import { encrypt, decrypt } from "@/lib/crypto";
import { RateLimiter } from "@/lib/rate-limit/rate-limiter";
import { signAccessToken, signRefreshToken, getExpirationDate } from "@/lib/auth/jwt";
import { UserRole } from "@/lib/auth/roles";
import {
  getClientIdentifier, createAuditLog, isProduction,
  setAuthCookies, sign2faChallenge, verify2faChallenge,
  getChallengeAttempts, incrementChallengeAttempts, clearChallengeAttempts,
  MAX_2FA_ATTEMPTS, registerDeviceSession,
} from "../_shared/helpers";

// ── Rate limiters ─────────────────────────────────────────────────────────────
const totpSetupLimiter = new RateLimiter({ limit: 5, window: 300, prefix: 'totp-setup', failClosedInProduction: true });
const totpVerifyLimiter = new RateLimiter({ limit: 10, window: 300, prefix: 'totp-verify', failClosedInProduction: true });
const totpDisableRequestLimiter = new RateLimiter({ limit: 5, window: 600, prefix: 'totp-disable-request', failClosedInProduction: true });
const totpDisableLimiter = new RateLimiter({ limit: 5, window: 300, prefix: 'totp-disable', failClosedInProduction: true });
const totpRegenLimiter = new RateLimiter({ limit: 3, window: 600, prefix: 'totp-regen', failClosedInProduction: true });
// H-5: 5 attempts per 5-min window per IP — same as challenge attempts Redis cap (MAX_2FA_ATTEMPTS)
const twoFaLoginVerifyLimiter = new RateLimiter({ limit: 5, window: 300, prefix: '2fa-login-verify', failClosedInProduction: true });

// ── Schemas ───────────────────────────────────────────────────────────────────
const totpVerifySchema = z.object({
  code: z.string().min(6).max(8),
  deviceId: z.string().uuid(),
  name: z.string().min(1).max(100).optional().default('Authenticator App'),
});

const totpDisableRequestSchema = z.object({
  totpCode: z.string().min(6).max(8),
});

const totpDisableSchema = z.object({
  emailCode: z.string().min(6).max(8),
  totpCode: z.string().min(6).max(8),
});

const totpRegenerateSchema = z.object({
  totpCode: z.string().min(6).max(8),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Verifica código TOTP (window ±1 passo = 90 seg de tolerância). */
function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  try {
    const secret = decrypt(encryptedSecret);
    const totp = new OTPAuth.TOTP({
      issuer: process.env.APP_NAME || 'Quayer',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

/** Substitui todos os recovery codes do usuário por novos (já hasheados). */
async function replaceRecoveryCodes(userId: string, plainCodes: string[]): Promise<void> {
  await db.recoveryCode.deleteMany({ where: { userId } });
  const hashed = await Promise.all(
    plainCodes.map(async (code) => ({
      userId,
      code: await hashPassword(code),
    }))
  );
  await db.recoveryCode.createMany({ data: hashed });
}

/** Extrai IP do cliente para rate-limit. */
function getClientId(request: { headers?: Headers | Record<string, string | string[] | undefined> }): string {
  const headers = request.headers;
  if (!headers) return 'unknown';
  const forwarded = headers instanceof Headers
    ? headers.get('x-forwarded-for')
    : headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0].trim();
  return 'unknown';
}

// ── Controller ────────────────────────────────────────────────────────────────
export const totpController = igniter.controller({
  name: "auth-totp",
  path: "/auth",
  description: "TOTP/2FA management endpoints",
  actions: {

    // ── POST /auth/totp/setup ────────────────────────────────────────────────
    totpSetup: igniter.mutation({
      name: 'TOTP Setup',
      description: 'Generate TOTP secret and QR code, create a pending TotpDevice',
      path: '/totp/setup',
      method: 'POST',
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Authentication required');

        const rl = await totpSetupLimiter.check(getClientId(request));
        if (!rl.success) {
          return response.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
        }

        // Gerar secret TOTP
        const secret = new OTPAuth.Secret({ size: 20 });
        const secretBase32 = secret.base32;

        const totp = new OTPAuth.TOTP({
          issuer: process.env.APP_NAME || 'Quayer',
          label: user.email,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret,
        });

        const otpauthUrl = totp.toString();
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

        // Persistir device pendente (verified = false)
        const device = await db.totpDevice.create({
          data: {
            userId: user.id,
            secret: encrypt(secretBase32),
            name: 'Authenticator App',
            verified: false,
          },
        });

        return response.success({
          deviceId: device.id,
          qrCode: qrCodeDataUrl,
          otpauthUrl,
          // Secret em base32 para entrada manual no app autenticador
          manualEntryKey: secretBase32,
        });
      },
    }),

    // ── POST /auth/totp/verify ───────────────────────────────────────────────
    totpVerify: igniter.mutation({
      name: 'TOTP Verify',
      description: 'Verify TOTP code and activate the pending device',
      path: '/totp/verify',
      method: 'POST',
      body: totpVerifySchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Authentication required');

        const rl = await totpVerifyLimiter.check(getClientId(request));
        if (!rl.success) {
          return response.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
        }

        const { code, deviceId, name } = request.body;

        // Buscar device pendente pertencente ao usuário
        const device = await db.totpDevice.findFirst({
          where: { id: deviceId, userId: user.id, verified: false },
        });

        if (!device) {
          return response.notFound('TOTP device not found or already verified');
        }

        if (!verifyTotpCode(device.secret, code)) {
          return response.badRequest('Invalid TOTP code');
        }

        // Gerar e armazenar recovery codes
        const plainRecoveryCodes = generateRecoveryCodes(8);

        await Promise.all([
          db.totpDevice.update({
            where: { id: device.id },
            data: { verified: true, name },
          }),
          db.user.update({
            where: { id: user.id },
            data: { twoFactorEnabled: true },
          }),
          replaceRecoveryCodes(user.id, plainRecoveryCodes),
        ]);

        return response.success({
          message: '2FA enabled successfully',
          // Retornado apenas uma vez — usuário deve guardar agora
          recoveryCodes: plainRecoveryCodes,
        });
      },
    }),

    // ── GET /auth/totp/devices ───────────────────────────────────────────────
    totpDevices: igniter.query({
      name: 'TOTP Devices',
      description: 'List active TOTP devices for the current user',
      path: '/totp/devices',
      use: [authProcedure({ required: true })],
      handler: async ({ context, response }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Authentication required');

        const devices = await db.totpDevice.findMany({
          where: { userId: user.id, verified: true },
          select: { id: true, name: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });

        const recoveryCodesCount = await db.recoveryCode.count({
          where: { userId: user.id, usedAt: null },
        });

        return response.success({
          devices,
          twoFactorEnabled: user.twoFactorEnabled ?? false,
          recoveryCodesRemaining: recoveryCodesCount,
        });
      },
    }),

    // ── POST /auth/totp/disable-request ─────────────────────────────────────
    totpDisableRequest: igniter.mutation({
      name: 'TOTP Disable Request',
      description: 'Send email verification code to initiate 2FA disablement',
      path: '/totp/disable-request',
      method: 'POST',
      body: totpDisableRequestSchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Authentication required');

        const rl = await totpDisableRequestLimiter.check(getClientId(request));
        if (!rl.success) {
          return response.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
        }

        const fullUser = await db.user.findUnique({ where: { id: user.id } });
        if (!fullUser?.twoFactorEnabled) {
          return response.badRequest('Two-factor authentication is not enabled');
        }

        // Verificar TOTP antes de enviar email (prova de posse do device)
        const device = await db.totpDevice.findFirst({
          where: { userId: user.id, verified: true },
        });
        if (!device) {
          return response.badRequest('No active TOTP device found');
        }

        if (!verifyTotpCode(device.secret, request.body.totpCode)) {
          return response.badRequest('Invalid TOTP code');
        }

        // Gerar código de 6 dígitos com TTL de 15 minutos
        const emailCode = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await db.verificationCode.deleteMany({
          where: { userId: user.id, type: 'TOTP_DISABLE' },
        });
        await db.verificationCode.create({
          data: {
            userId: user.id,
            identifier: fullUser.email,
            code: await hashPassword(emailCode),
            type: 'TOTP_DISABLE',
            expiresAt,
          },
        });

        const displayName = fullUser.name || fullUser.email;
        const emailHtml = '<div style="font-family:sans-serif;max-width:480px;margin:auto">'
          + '<h2>Desativar autenticacao de dois fatores</h2>'
          + '<p>Ola, <strong>' + displayName + '</strong>!</p>'
          + '<p>Recebemos uma solicitacao para desativar o 2FA da sua conta.</p>'
          + '<p>Seu codigo de confirmacao:</p>'
          + '<div style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:24px 0;color:#111">'
          + emailCode
          + '</div>'
          + '<p>Este codigo expira em <strong>15 minutos</strong>.</p>'
          + '<p>Se voce nao solicitou isso, ignore este email — sua conta permanece segura.</p>'
          + '</div>';

        await emailService.send({
          to: fullUser.email,
          subject: 'Desativar 2FA - Quayer',
          html: emailHtml,
        });

        return response.success({ message: 'Verification code sent to your email' });
      },
    }),

    // ── POST /auth/totp/disable ──────────────────────────────────────────────
    totpDisable: igniter.mutation({
      name: 'TOTP Disable',
      description: 'Disable 2FA after verifying both email code and TOTP code',
      path: '/totp/disable',
      method: 'POST',
      body: totpDisableSchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Authentication required');

        const rl = await totpDisableLimiter.check(getClientId(request));
        if (!rl.success) {
          return response.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
        }

        const { emailCode, totpCode } = request.body;

        const fullUser = await db.user.findUnique({ where: { id: user.id } });
        if (!fullUser) return response.unauthorized('User not found');

        if (!fullUser.twoFactorEnabled) {
          return response.badRequest('Two-factor authentication is not enabled');
        }

        // Verificar código de email via VerificationCode
        const pending = await db.verificationCode.findFirst({
          where: { userId: user.id, type: 'TOTP_DISABLE', used: false },
          orderBy: { createdAt: 'desc' },
        });

        if (!pending) {
          return response.badRequest('No pending disable request found. Please request a code first.');
        }

        if (new Date() > pending.expiresAt) {
          return response.badRequest('Email verification code has expired');
        }

        const emailCodeValid = await verifyPassword(emailCode, pending.code);
        if (!emailCodeValid) {
          return response.badRequest('Invalid email verification code');
        }

        // Verificar TOTP
        const device = await db.totpDevice.findFirst({
          where: { userId: user.id, verified: true },
        });
        if (!device) {
          return response.badRequest('No active TOTP device found');
        }

        if (!verifyTotpCode(device.secret, totpCode)) {
          return response.badRequest('Invalid TOTP code');
        }

        // Desativar 2FA: remover devices, recovery codes e marcar código como usado
        await Promise.all([
          db.totpDevice.deleteMany({ where: { userId: user.id } }),
          db.recoveryCode.deleteMany({ where: { userId: user.id } }),
          db.verificationCode.updateMany({
            where: { userId: user.id, type: 'TOTP_DISABLE' },
            data: { used: true },
          }),
          db.user.update({
            where: { id: user.id },
            data: { twoFactorEnabled: false },
          }),
        ]);

        return response.success({ message: '2FA disabled successfully' });
      },
    }),

    // ── POST /auth/totp/regenerate-codes ────────────────────────────────────
    totpRegenerateCodes: igniter.mutation({
      name: 'TOTP Regenerate Recovery Codes',
      description: 'Regenerate recovery codes (requires valid TOTP code)',
      path: '/totp/regenerate-codes',
      method: 'POST',
      body: totpRegenerateSchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Authentication required');

        const rl = await totpRegenLimiter.check(getClientId(request));
        if (!rl.success) {
          return response.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
        }

        const { totpCode } = request.body;

        const device = await db.totpDevice.findFirst({
          where: { userId: user.id, verified: true },
        });

        if (!device) {
          return response.badRequest('No active TOTP device found');
        }

        if (!verifyTotpCode(device.secret, totpCode)) {
          return response.badRequest('Invalid TOTP code');
        }

        const plainRecoveryCodes = generateRecoveryCodes(8);
        await replaceRecoveryCodes(user.id, plainRecoveryCodes);

        return response.success({
          message: 'Recovery codes regenerated successfully',
          recoveryCodes: plainRecoveryCodes,
        });
      },
    }),

    // ── POST /auth/2fa/verify ────────────────────────────────────────────────
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

        // ── 1. Verify the 2FA challenge JWT ───────────────────────────────────
        const challengePayload = verify2faChallenge(challengeId);
        if (!challengePayload) {
          return response.status(401).json({ error: 'Invalid or expired 2FA challenge' });
        }

        const { userId } = challengePayload;

        // ── 2. Enforce per-challenge attempt cap (Redis) ───────────────────────
        const attempts = await getChallengeAttempts(challengeId);
        if (attempts >= MAX_2FA_ATTEMPTS) {
          return response.status(429).json({ error: 'Too many 2FA attempts. Please start over.' });
        }

        // ── 3. Fetch user + active TOTP device ────────────────────────────────
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

        // ── 4. Try TOTP code first ────────────────────────────────────────────
        const device = await db.totpDevice.findFirst({
          where: { userId: user.id, verified: true },
        });

        let authenticated = false;
        let usedRecoveryCode = false;

        if (device && verifyTotpCode(device.secret, code)) {
          authenticated = true;
        }

        // ── 5. If TOTP fails, try recovery codes ──────────────────────────────
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

        // ── 6. Issue auth session ─────────────────────────────────────────────
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

        // Register device session + geo check BEFORE setting cookies
        const deviceResult = await registerDeviceSession(user.id, request);
        if (deviceResult.blocked) {
          return Response.json(
            { error: 'Login bloqueado por política de segurança. Contate o administrador.' },
            { status: 403 }
          );
        }

        setAuthCookies(response, accessToken, refreshToken);

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

  },
});
