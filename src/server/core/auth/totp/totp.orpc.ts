/**
 * Auth/TOTP — porta mecânica para oRPC (lote 4c do controller auth).
 *
 * Origem: ./setup.routes.ts + ./login.routes.ts + ./disable.routes.ts
 * (7 actions), reusando ./totp.helpers.ts (verifyTotpCode com window ±1,
 * replaceRecoveryCodes) e os helpers de challenge 2FA de _shared/helpers.
 *
 * Preservação de URL (basePath /api/v1 + controller /auth + action):
 *   totpSetup             POST /api/v1/auth/totp/setup
 *   totpVerify            POST /api/v1/auth/totp/verify
 *   totpDevices           GET  /api/v1/auth/totp/devices
 *   twoFactorLoginVerify  POST /api/v1/auth/2fa/verify
 *   totpDisableRequest    POST /api/v1/auth/totp/disable-request
 *   totpDisable           POST /api/v1/auth/totp/disable
 *   totpRegenerateCodes   POST /api/v1/auth/totp/regenerate-codes
 *
 * Fidelidade: secret criptografado no banco; recovery codes hasheados e
 * retornados UMA vez; 2FA login verify com cap de tentativas por challenge
 * (Redis), fallback para recovery code one-time, device+geo ANTES da
 * sessão; disable em dois fatores (email + TOTP) com prova de posse antes
 * do envio do email.
 */
import { ORPCError } from '@orpc/server'
import crypto from 'crypto'
import { z } from 'zod'
import * as OTPAuth from 'otpauth'
import QRCode from 'qrcode'
import { database as db } from '@/server/services/database'
import { hashPassword, verifyPassword, generateRecoveryCodes } from '@/lib/auth/bcrypt'
import { RateLimiter } from '@/lib/rate-limit/rate-limiter'
import { encrypt } from '@/lib/crypto'
import { emailService } from '@/lib/email'
import {
  getClientIdentifier,
  createAuditLog,
  registerDeviceSession,
  verify2faChallenge,
  getChallengeAttempts,
  incrementChallengeAttempts,
  clearChallengeAttempts,
  MAX_2FA_ATTEMPTS,
} from '../_shared/helpers'
import { issueSession } from '../_shared/issue-session'
import { verifyTotpCode, replaceRecoveryCodes } from './totp.helpers'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { cookieWriter } from '@/orpc/cookies'
import { requireAuth } from '@/orpc/auth.middleware'
import { requireCsrf } from '@/orpc/csrf.middleware'

// ── Rate limiters (mesmas configs/prefixos dos originais) ──────────────────
const totpSetupLimiter = new RateLimiter({ limit: 5, window: 300, prefix: 'totp-setup', failClosedInProduction: true })
const totpVerifyLimiter = new RateLimiter({ limit: 10, window: 300, prefix: 'totp-verify', failClosedInProduction: true })
const twoFaLoginVerifyLimiter = new RateLimiter({ limit: 5, window: 300, prefix: '2fa-login-verify', failClosedInProduction: true })
const totpDisableRequestLimiter = new RateLimiter({ limit: 5, window: 600, prefix: 'totp-disable-request', failClosedInProduction: true })
const totpDisableLimiter = new RateLimiter({ limit: 5, window: 300, prefix: 'totp-disable', failClosedInProduction: true })
const totpRegenLimiter = new RateLimiter({ limit: 3, window: 600, prefix: 'totp-regen', failClosedInProduction: true })

// ── Schemas (cópia 1:1) ────────────────────────────────────────────────────
const totpVerifySchema = z.object({
  code: z.string().min(6).max(8),
  deviceId: z.string().uuid(),
  name: z.string().min(1).max(100).optional().default('Authenticator App'),
})
const twoFaVerifySchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(6).max(10), // 6-digit TOTP ou recovery code (maior)
})
const totpDisableRequestSchema = z.object({ totpCode: z.string().min(6).max(8) })
const totpDisableSchema = z.object({
  emailCode: z.string().min(6).max(8),
  totpCode: z.string().min(6).max(8),
})
const totpRegenerateSchema = z.object({ totpCode: z.string().min(6).max(8) })

const authed = base.use(requireAuth)
const authedCsrf = authed.use(requireCsrf)

function reqOf(headers: Headers) {
  return { headers }
}

function userOf(context: { auth: { session: { user: unknown } } }) {
  const user = context.auth.session.user as {
    id: string
    email: string
    twoFactorEnabled?: boolean
  } | null
  if (!user) throw new ORPCError('UNAUTHORIZED', { message: 'Authentication required' })
  return user
}

async function checkLimiter(limiter: RateLimiter, headers: Headers, message = 'Too many requests') {
  const rl = await limiter.check(getClientIdentifier({ headers }))
  if (!rl.success) {
    throw new ORPCError('TOO_MANY_REQUESTS', { message, data: { retryAfter: rl.retryAfter } })
  }
}

// ──────────────────────────────────────────────────────────────────────────
// SETUP — POST /auth/totp/setup
// ──────────────────────────────────────────────────────────────────────────
export const totpSetup = authedCsrf
  .route({
    method: 'POST',
    path: '/auth/totp/setup',
    summary: 'TOTP Setup',
    description: 'Generate TOTP secret and QR code, create a pending TotpDevice',
  })
  .handler(async ({ context }) => {
    const user = userOf(context)
    await checkLimiter(totpSetupLimiter, context.headers)

    const secret = new OTPAuth.Secret({ size: 20 })
    const secretBase32 = secret.base32

    const totp = new OTPAuth.TOTP({
      issuer: process.env.APP_NAME || 'Quayer',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    })

    const otpauthUrl = totp.toString()
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl)

    // Device pendente (verified = false); secret criptografado
    const device = await db.totpDevice.create({
      data: {
        userId: user.id,
        secret: encrypt(secretBase32),
        name: 'Authenticator App',
        verified: false,
      },
    })

    return ok({
      deviceId: device.id,
      qrCode: qrCodeDataUrl,
      otpauthUrl,
      // Secret em base32 para entrada manual no app autenticador
      manualEntryKey: secretBase32,
    })
  })

// ──────────────────────────────────────────────────────────────────────────
// VERIFY (ativação) — POST /auth/totp/verify
// ──────────────────────────────────────────────────────────────────────────
export const totpVerify = authedCsrf
  .route({
    method: 'POST',
    path: '/auth/totp/verify',
    summary: 'TOTP Verify',
    description: 'Verify TOTP code and activate the pending device',
  })
  .input(totpVerifySchema)
  .handler(async ({ input, context }) => {
    const user = userOf(context)
    await checkLimiter(totpVerifyLimiter, context.headers)

    const { code, deviceId, name } = input

    const device = await db.totpDevice.findFirst({
      where: { id: deviceId, userId: user.id, verified: false },
    })

    if (!device) {
      throw new ORPCError('NOT_FOUND', { message: 'TOTP device not found or already verified' })
    }

    if (!verifyTotpCode(device.secret, code)) {
      throw new ORPCError('BAD_REQUEST', { message: 'Invalid TOTP code' })
    }

    const plainRecoveryCodes = generateRecoveryCodes(8)

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
    ])

    return ok({
      message: '2FA enabled successfully',
      // Retornado apenas uma vez — usuário deve guardar agora
      recoveryCodes: plainRecoveryCodes,
    })
  })

// ──────────────────────────────────────────────────────────────────────────
// DEVICES — GET /auth/totp/devices
// ──────────────────────────────────────────────────────────────────────────
export const totpDevices = authed
  .route({
    method: 'GET',
    path: '/auth/totp/devices',
    summary: 'TOTP Devices',
    description: 'List active TOTP devices for the current user',
  })
  .handler(async ({ context }) => {
    const user = userOf(context)

    const devices = await db.totpDevice.findMany({
      where: { userId: user.id, verified: true },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })

    const recoveryCodesCount = await db.recoveryCode.count({
      where: { userId: user.id, usedAt: null },
    })

    return ok({
      devices,
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      recoveryCodesRemaining: recoveryCodesCount,
    })
  })

// ──────────────────────────────────────────────────────────────────────────
// 2FA LOGIN VERIFY — POST /auth/2fa/verify (H-5; CSRF, sem auth)
// ──────────────────────────────────────────────────────────────────────────
export const twoFactorLoginVerify = base
  .use(requireCsrf)
  .route({
    method: 'POST',
    path: '/auth/2fa/verify',
    summary: '2FA Login Verify',
    description: 'Complete login after first factor by verifying TOTP code or recovery code (H-5)',
  })
  .input(twoFaVerifySchema)
  .handler(async ({ input, context }) => {
    await checkLimiter(twoFaLoginVerifyLimiter, context.headers, 'Too many attempts')

    const { challengeId, code } = input

    // 1. Challenge JWT
    const challengePayload = verify2faChallenge(challengeId)
    if (!challengePayload) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Invalid or expired 2FA challenge' })
    }

    const { userId } = challengePayload

    // 2. Cap de tentativas por challenge (Redis)
    const attempts = await getChallengeAttempts(challengeId)
    if (attempts >= MAX_2FA_ATTEMPTS) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many 2FA attempts. Please start over.',
      })
    }

    // 3. User + device ativo
    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        organizations: {
          where: { isActive: true },
          include: { organization: true },
        },
      },
    })

    if (!user || !user.isActive) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Authentication failed' })
    }

    if (!user.twoFactorEnabled) {
      // 2FA desativado entre a emissão do challenge e o verify — fail secure
      throw new ORPCError('UNAUTHORIZED', { message: 'Authentication failed' })
    }

    // 4. TOTP primeiro
    const device = await db.totpDevice.findFirst({
      where: { userId: user.id, verified: true },
    })

    let authenticated = false
    let usedRecoveryCode = false

    if (device && verifyTotpCode(device.secret, code)) {
      authenticated = true
    }

    // 5. Fallback: recovery codes (one-time)
    if (!authenticated) {
      const recoveryCodes = await db.recoveryCode.findMany({
        where: { userId: user.id, usedAt: null },
      })

      for (const rc of recoveryCodes) {
        const isMatch = await verifyPassword(code, rc.code)
        if (isMatch) {
          await db.recoveryCode.update({
            where: { id: rc.id },
            data: { usedAt: new Date() },
          })
          authenticated = true
          usedRecoveryCode = true
          break
        }
      }
    }

    if (!authenticated) {
      await incrementChallengeAttempts(challengeId)
      throw new ORPCError('UNAUTHORIZED', { message: 'Invalid 2FA code' })
    }

    // 6. Sessão
    await clearChallengeAttempts(challengeId)

    let currentOrgId = user.currentOrgId
    if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
      currentOrgId = user.organizations[0].organizationId
      await db.user.update({ where: { id: user.id }, data: { currentOrgId } })
    }

    const currentOrgRelation = user.organizations.find(
      (org) => org.organizationId === currentOrgId,
    )

    // Device + geo ANTES de emitir tokens
    const deviceResult = await registerDeviceSession(user.id, reqOf(context.headers))
    if (deviceResult.blocked) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Login bloqueado por politica de seguranca. Contate o administrador.',
      })
    }

    await issueSession(
      cookieWriter(context.resHeaders),
      {
        id: user.id,
        email: user.email,
        role: user.role,
        currentOrgId,
        onboardingCompleted: user.onboardingCompleted,
      },
      {
        organizationRole: currentOrgRelation?.role as never,
      },
    )

    await createAuditLog(
      'auth.login',
      user.id,
      reqOf(context.headers),
      { method: 'totp-2fa', usedRecoveryCode },
      currentOrgId,
    )

    return ok({
      needsOnboarding: !user.onboardingCompleted,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        currentOrgId,
        organizationRole: currentOrgRelation?.role,
      },
    })
  })

// ──────────────────────────────────────────────────────────────────────────
// DISABLE REQUEST — POST /auth/totp/disable-request
// ──────────────────────────────────────────────────────────────────────────
export const totpDisableRequest = authedCsrf
  .route({
    method: 'POST',
    path: '/auth/totp/disable-request',
    summary: 'TOTP Disable Request',
    description: 'Send email verification code to initiate 2FA disablement',
  })
  .input(totpDisableRequestSchema)
  .handler(async ({ input, context }) => {
    const user = userOf(context)
    await checkLimiter(totpDisableRequestLimiter, context.headers)

    const fullUser = await db.user.findUnique({ where: { id: user.id } })
    if (!fullUser?.twoFactorEnabled) {
      throw new ORPCError('BAD_REQUEST', { message: 'Two-factor authentication is not enabled' })
    }

    // Prova de posse do device ANTES de enviar email
    const device = await db.totpDevice.findFirst({
      where: { userId: user.id, verified: true },
    })
    if (!device) {
      throw new ORPCError('BAD_REQUEST', { message: 'No active TOTP device found' })
    }

    if (!verifyTotpCode(device.secret, input.totpCode)) {
      throw new ORPCError('BAD_REQUEST', { message: 'Invalid TOTP code' })
    }

    // Código de 6 dígitos com TTL de 15 minutos (hasheado no banco)
    const emailCode = crypto.randomInt(100000, 999999).toString()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    await db.verificationCode.deleteMany({
      where: { userId: user.id, type: 'TOTP_DISABLE' },
    })
    await db.verificationCode.create({
      data: {
        userId: user.id,
        identifier: fullUser.email,
        code: await hashPassword(emailCode),
        type: 'TOTP_DISABLE',
        expiresAt,
      },
    })

    const displayName = fullUser.name || fullUser.email
    const emailHtml =
      '<div style="font-family:sans-serif;max-width:480px;margin:auto">' +
      '<h2>Desativar autenticacao de dois fatores</h2>' +
      '<p>Ola, <strong>' + displayName + '</strong>!</p>' +
      '<p>Recebemos uma solicitacao para desativar o 2FA da sua conta.</p>' +
      '<p>Seu codigo de confirmacao:</p>' +
      '<div style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:24px 0;color:#111">' +
      emailCode +
      '</div>' +
      '<p>Este codigo expira em <strong>15 minutos</strong>.</p>' +
      '<p>Se voce nao solicitou isso, ignore este email — sua conta permanece segura.</p>' +
      '</div>'

    await emailService.send({
      to: fullUser.email,
      subject: 'Desativar 2FA - Quayer',
      html: emailHtml,
    })

    return ok({ message: 'Verification code sent to your email' })
  })

// ──────────────────────────────────────────────────────────────────────────
// DISABLE — POST /auth/totp/disable (email code + TOTP code)
// ──────────────────────────────────────────────────────────────────────────
export const totpDisable = authedCsrf
  .route({
    method: 'POST',
    path: '/auth/totp/disable',
    summary: 'TOTP Disable',
    description: 'Disable 2FA after verifying both email code and TOTP code',
  })
  .input(totpDisableSchema)
  .handler(async ({ input, context }) => {
    const user = userOf(context)
    await checkLimiter(totpDisableLimiter, context.headers)

    const { emailCode, totpCode } = input

    const fullUser = await db.user.findUnique({ where: { id: user.id } })
    if (!fullUser) throw new ORPCError('UNAUTHORIZED', { message: 'User not found' })

    if (!fullUser.twoFactorEnabled) {
      throw new ORPCError('BAD_REQUEST', { message: 'Two-factor authentication is not enabled' })
    }

    const pending = await db.verificationCode.findFirst({
      where: { userId: user.id, type: 'TOTP_DISABLE', used: false },
      orderBy: { createdAt: 'desc' },
    })

    if (!pending) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'No pending disable request found. Please request a code first.',
      })
    }

    if (new Date() > pending.expiresAt) {
      throw new ORPCError('BAD_REQUEST', { message: 'Email verification code has expired' })
    }

    const emailCodeValid = await verifyPassword(emailCode, pending.code)
    if (!emailCodeValid) {
      throw new ORPCError('BAD_REQUEST', { message: 'Invalid email verification code' })
    }

    const device = await db.totpDevice.findFirst({
      where: { userId: user.id, verified: true },
    })
    if (!device) {
      throw new ORPCError('BAD_REQUEST', { message: 'No active TOTP device found' })
    }

    if (!verifyTotpCode(device.secret, totpCode)) {
      throw new ORPCError('BAD_REQUEST', { message: 'Invalid TOTP code' })
    }

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
    ])

    return ok({ message: '2FA disabled successfully' })
  })

// ──────────────────────────────────────────────────────────────────────────
// REGENERATE CODES — POST /auth/totp/regenerate-codes
// ──────────────────────────────────────────────────────────────────────────
export const totpRegenerateCodes = authedCsrf
  .route({
    method: 'POST',
    path: '/auth/totp/regenerate-codes',
    summary: 'TOTP Regenerate Recovery Codes',
    description: 'Regenerate recovery codes (requires valid TOTP code)',
  })
  .input(totpRegenerateSchema)
  .handler(async ({ input, context }) => {
    const user = userOf(context)
    await checkLimiter(totpRegenLimiter, context.headers)

    const device = await db.totpDevice.findFirst({
      where: { userId: user.id, verified: true },
    })

    if (!device) {
      throw new ORPCError('BAD_REQUEST', { message: 'No active TOTP device found' })
    }

    if (!verifyTotpCode(device.secret, input.totpCode)) {
      throw new ORPCError('BAD_REQUEST', { message: 'Invalid TOTP code' })
    }

    const plainRecoveryCodes = generateRecoveryCodes(8)
    await replaceRecoveryCodes(user.id, plainRecoveryCodes)

    return ok({
      message: 'Recovery codes regenerated successfully',
      recoveryCodes: plainRecoveryCodes,
    })
  })

/** Lote totp do namespace auth (api.auth.* no client Igniter). */
export const totpActions = {
  totpSetup,
  totpVerify,
  totpDevices,
  twoFactorLoginVerify,
  totpDisableRequest,
  totpDisable,
  totpRegenerateCodes,
}
