/**
 * Auth/Phone-OTP — porta mecânica para oRPC (lote 4b do controller auth).
 *
 * Origem: ./phone-otp.controller.ts (2 actions). OTP por telefone é
 * WhatsApp via UAZAPI (lib @/lib/uaz/whatsapp-otp REUSADA — não há SMS);
 * a escolha oficial×UAZAPI é decisão da fase 4 (channel-whatsapp).
 *
 * Preservação de URL (basePath /api/v1 + controller /auth + action):
 *   loginOTPPhone        POST /api/v1/auth/login-otp-phone
 *   verifyLoginOTPPhone  POST /api/v1/auth/verify-login-otp-phone
 *
 * Fidelidade: signup gate só para telefones novos; gate OTP-phone-disabled;
 * delete+create do código (um ativo por telefone); honestidade de entrega
 * (falha da UAZAPI = 400, nunca {sent:true} mentiroso); verify é
 * existing-user-only com resposta indistinguível para telefone não
 * cadastrado; consumo atômico; phoneVerified na primeira verificação;
 * gate 2FA; finalizeLogin com os mesmos audit events.
 */
import { ORPCError } from '@orpc/server'
import { database as db } from '@/server/services/database'
import { phoneOTPSchema, verifyPhoneOTPSchema } from '../auth.schemas'
import { normalizePhone, sendWhatsAppOTP } from '@/lib/uaz/whatsapp-otp'
import { generateOTPCode } from '@/lib/auth/bcrypt'
import { otpVerifyLoginRateLimiter } from '@/lib/rate-limit/rate-limiter'
import { checkOtpRateLimit } from '@/lib/rate-limit/otp-rate-limit'
import { getClientIdentifier } from '../_shared/helpers'
import { isSignupEnabled, SIGNUP_DISABLED_MESSAGE } from '../_shared/signup-gate'
import { check2faAndIssueChallenge } from '../_shared/two-factor-gate'
import { finalizeLogin } from '../_shared/finalize-login'
import { UserRole, OrganizationRole } from '@/lib/auth/roles'
import { z } from 'zod'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { cookieWriter } from '@/orpc/cookies'
import { requireCsrf } from '@/orpc/csrf.middleware'
import { enforceTurnstile } from '@/orpc/turnstile'

const turnstileField = { 'cf-turnstile-response': z.string().optional() }

function reqOf(headers: Headers) {
  return { headers }
}

// ──────────────────────────────────────────────────────────────────────────
// LOGIN OTP PHONE — POST /auth/login-otp-phone (turnstile)
// ──────────────────────────────────────────────────────────────────────────
export const loginOTPPhone = base
  .route({
    method: 'POST',
    path: '/auth/login-otp-phone',
    summary: 'Login OTP Phone',
    description: 'Request WhatsApp OTP code',
  })
  .input(phoneOTPSchema.extend(turnstileField))
  .handler(async ({ input, context }) => {
    await enforceTurnstile(context.headers, input['cf-turnstile-response'])

    const normalized = normalizePhone(input.phone)
    const clientIp = getClientIdentifier(reqOf(context.headers))

    // Login (existente) ou signup (novo)? Preferences para o gate de 2FA.
    const phoneUser = await db.user.findFirst({
      where: { phone: normalized },
      select: {
        twoFactorEnabled: true,
        preferences: { select: { otpPhoneDisabled: true } },
      },
    })

    // Signup gate só para usuários NOVOS (alinhado com googleCallback)
    if (!phoneUser && !isSignupEnabled()) {
      throw new ORPCError('FORBIDDEN', { message: SIGNUP_DISABLED_MESSAGE })
    }

    if (phoneUser?.twoFactorEnabled && phoneUser.preferences?.otpPhoneDisabled) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'OTP por telefone desabilitado. Use seu aplicativo autenticador para fazer login.',
      })
    }

    // Rate-limit: 3 por telefone/15min, 5 por IP/hora
    const rateLimitResult = await checkOtpRateLimit(normalized, clientIp)
    if (!rateLimitResult.success) {
      const retryAfter = rateLimitResult.retryAfter || 60
      console.warn(`[loginOTPPhone] Rate limited — phone: ${normalized}, IP: ${clientIp}`)
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: `Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} minuto(s).`,
        data: { retryAfter },
      })
    }

    const code = generateOTPCode()

    await db.verificationCode.deleteMany({
      where: { identifier: normalized, type: 'WHATSAPP_OTP' },
    })
    await db.verificationCode.create({
      data: {
        identifier: normalized,
        code,
        type: 'WHATSAPP_OTP',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    })

    let delivered = false
    try {
      delivered = await sendWhatsAppOTP(normalized, code)
    } catch (err) {
      console.error('[loginOTPPhone] sendWhatsAppOTP threw:', err)
      delivered = false
    }

    if (!delivered) {
      // Honestidade de entrega: UAZAPI falhou -> nunca responder {sent:true}
      throw new ORPCError('BAD_REQUEST', {
        message:
          'Não foi possível enviar o código pelo WhatsApp. Verifique o número e tente novamente, ou use email.',
      })
    }

    return ok({ sent: true })
  })

// ──────────────────────────────────────────────────────────────────────────
// VERIFY — POST /auth/verify-login-otp-phone (CSRF; existing-user-only)
// ──────────────────────────────────────────────────────────────────────────
export const verifyLoginOTPPhone = base
  .use(requireCsrf)
  .route({
    method: 'POST',
    path: '/auth/verify-login-otp-phone',
    summary: 'Verify Login OTP Phone',
    description: 'Verify WhatsApp OTP code and issue session',
  })
  .input(verifyPhoneOTPSchema)
  .handler(async ({ input, context }) => {
    const normalized = normalizePhone(input.phone)
    const { code } = input
    const clientIp = getClientIdentifier(reqOf(context.headers))

    // Rate limit — 5 attempts / 10 min per IP+phone
    const rlIdentifier = `${clientIp}:${normalized}`
    const rateLimit = await otpVerifyLoginRateLimiter.check(rlIdentifier)
    if (!rateLimit.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many attempts',
        data: { retryAfter: rateLimit.retryAfter },
      })
    }

    const otpRateLimit = await checkOtpRateLimit(`verify-login-phone:${normalized}`, clientIp)
    if (!otpRateLimit.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many attempts',
        data: { retryAfter: otpRateLimit.retryAfter },
      })
    }

    const user = await db.user.findFirst({
      where: { phone: normalized },
      include: {
        organizations: {
          where: { isActive: true },
          include: { organization: true },
        },
      },
    })

    // Telefone não cadastrado = mesma resposta de código inválido (não vaza)
    if (!user) throw new ORPCError('BAD_REQUEST', { message: 'Código inválido' })

    // Consumo atômico (previne replay em corrida)
    const consumed = await db.verificationCode.updateMany({
      where: {
        identifier: normalized,
        code,
        type: 'WHATSAPP_OTP',
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: { used: true },
    })

    if (consumed.count === 0) {
      throw new ORPCError('BAD_REQUEST', { message: 'Código inválido ou expirado' })
    }
    if (!user.isActive) throw new ORPCError('FORBIDDEN', { message: 'Conta desativada' })

    // Primeira verificação bem-sucedida marca o telefone como verificado
    if (!user.phoneVerified) {
      await db.user.update({ where: { id: user.id }, data: { phoneVerified: true } })
    }

    const twoFactorGate = await check2faAndIssueChallenge(user, reqOf(context.headers), 'phone-otp')
    if (twoFactorGate) return ok(twoFactorGate)

    let currentOrgId = user.currentOrgId
    if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
      currentOrgId = user.organizations[0].organizationId
      await db.user.update({ where: { id: user.id }, data: { currentOrgId } })
    }

    const currentOrgRelation = user.organizations.find(
      (org) => org.organizationId === currentOrgId,
    )

    const result = await finalizeLogin({
      user: {
        id: user.id,
        email: user.email,
        role: user.role as UserRole,
        currentOrgId,
        onboardingCompleted: user.onboardingCompleted,
      },
      request: reqOf(context.headers),
      response: cookieWriter(context.resHeaders),
      method: 'phone-otp',
      auditEvents: [
        { action: 'user.login', metadata: { phone: normalized } },
        { action: 'auth.login', metadata: { phone: normalized } },
      ],
      issueOptions: {
        organizationRole: currentOrgRelation?.role as OrganizationRole | undefined,
        accessTokenExpiry: '24h',
        refreshTokenExpiry: '7d',
      },
    })

    if (result.blocked) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Login bloqueado por política de segurança. Contate o administrador.',
      })
    }

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

/** Lote phone-otp do namespace auth (api.auth.* no client Igniter). */
export const phoneOtpActions = {
  loginOTPPhone,
  verifyLoginOTPPhone,
}
