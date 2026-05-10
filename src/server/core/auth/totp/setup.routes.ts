/**
 * TOTP Setup Routes
 *
 * Actions:
 *   POST /auth/totp/setup    — gera secret + QR code, cria TotpDevice pendente
 *   POST /auth/totp/verify   — verifica codigo TOTP e ativa o device
 *   GET  /auth/totp/devices  — lista devices ativos do usuario
 */

import { z } from 'zod';
import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { hashPassword, generateRecoveryCodes } from '@/lib/auth/bcrypt';
import { authProcedure } from '../procedures/auth.procedure';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { RateLimiter } from '@/lib/rate-limit/rate-limiter';
import { encrypt } from '@/lib/crypto';
import { getClientIdentifier } from '../_shared/helpers';
import { verifyTotpCode, replaceRecoveryCodes } from './totp.helpers';

// ── Rate limiters ──────────────────────────────────────────────────────────────
const totpSetupLimiter = new RateLimiter({ limit: 5, window: 300, prefix: 'totp-setup', failClosedInProduction: true });
const totpVerifyLimiter = new RateLimiter({ limit: 10, window: 300, prefix: 'totp-verify', failClosedInProduction: true });

// ── Schemas ────────────────────────────────────────────────────────────────────
const totpVerifySchema = z.object({
  code: z.string().min(6).max(8),
  deviceId: z.string().uuid(),
  name: z.string().min(1).max(100).optional().default('Authenticator App'),
});

// ── Routes ─────────────────────────────────────────────────────────────────────
export const setupRoutes = {

  // ── POST /auth/totp/setup ──────────────────────────────────────────────────
  totpSetup: igniter.mutation({
    name: 'TOTP Setup',
    description: 'Generate TOTP secret and QR code, create a pending TotpDevice',
    path: '/totp/setup',
    method: 'POST',
    use: [authProcedure({ required: true }), csrfProcedure()],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user;
      if (!user) return response.unauthorized('Authentication required');

      const rl = await totpSetupLimiter.check(getClientIdentifier(request));
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

  // ── POST /auth/totp/verify ─────────────────────────────────────────────────
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

      const rl = await totpVerifyLimiter.check(getClientIdentifier(request));
      if (!rl.success) {
        return response.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
      }

      const { code, deviceId, name } = request.body;

      // Buscar device pendente pertencente ao usuario
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
        // Retornado apenas uma vez — usuario deve guardar agora
        recoveryCodes: plainRecoveryCodes,
      });
    },
  }),

  // ── GET /auth/totp/devices ─────────────────────────────────────────────────
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
};
