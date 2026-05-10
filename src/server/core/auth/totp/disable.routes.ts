/**
 * TOTP Disable Routes
 *
 * Actions:
 *   POST /auth/totp/disable-request   — envia email com codigo para desativar 2FA
 *   POST /auth/totp/disable           — desativa 2FA (requer emailCode + totpCode)
 *   POST /auth/totp/regenerate-codes  — regenera recovery codes
 */

import crypto from 'crypto';
import { z } from 'zod';
import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import { hashPassword, verifyPassword, generateRecoveryCodes } from '@/lib/auth/bcrypt';
import { authProcedure } from '../procedures/auth.procedure';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { RateLimiter } from '@/lib/rate-limit/rate-limiter';
import { emailService } from '@/lib/email';
import { getClientIdentifier } from '../_shared/helpers';
import { verifyTotpCode, replaceRecoveryCodes } from './totp.helpers';

// ── Rate limiters ──────────────────────────────────────────────────────────────
const totpDisableRequestLimiter = new RateLimiter({ limit: 5, window: 600, prefix: 'totp-disable-request', failClosedInProduction: true });
const totpDisableLimiter = new RateLimiter({ limit: 5, window: 300, prefix: 'totp-disable', failClosedInProduction: true });
const totpRegenLimiter = new RateLimiter({ limit: 3, window: 600, prefix: 'totp-regen', failClosedInProduction: true });

// ── Schemas ────────────────────────────────────────────────────────────────────
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

// ── Routes ─────────────────────────────────────────────────────────────────────
export const disableRoutes = {

  // ── POST /auth/totp/disable-request ───────────────────────────────────────
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

      const rl = await totpDisableRequestLimiter.check(getClientIdentifier(request));
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

      // Gerar codigo de 6 digitos com TTL de 15 minutos
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

  // ── POST /auth/totp/disable ────────────────────────────────────────────────
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

      const rl = await totpDisableLimiter.check(getClientIdentifier(request));
      if (!rl.success) {
        return response.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
      }

      const { emailCode, totpCode } = request.body;

      const fullUser = await db.user.findUnique({ where: { id: user.id } });
      if (!fullUser) return response.unauthorized('User not found');

      if (!fullUser.twoFactorEnabled) {
        return response.badRequest('Two-factor authentication is not enabled');
      }

      // Verificar codigo de email via VerificationCode
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

      // Desativar 2FA: remover devices, recovery codes e marcar codigo como usado
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

  // ── POST /auth/totp/regenerate-codes ──────────────────────────────────────
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

      const rl = await totpRegenLimiter.check(getClientIdentifier(request));
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
};
