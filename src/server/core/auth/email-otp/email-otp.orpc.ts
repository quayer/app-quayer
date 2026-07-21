/**
 * Auth/Email-OTP — porta mecânica para oRPC (lote 2 do controller auth).
 *
 * Origem: ./login.routes.ts + ./signup.routes.ts + ./verify-email.routes.ts
 * (5 actions). Reusa TODOS os utilitários compartilhados do app: rate
 * limiters singletons, checkOtpRateLimit, finalizeLogin (device+geo+session+
 * audit), check2faAndIssueChallenge, issueSession, autoJoinByVerifiedDomain,
 * emailService — cookies via cookieWriter(resHeaders).
 *
 * Preservação de URL (basePath /api/v1 + controller /auth + action):
 *   loginOTP         POST /api/v1/auth/login-otp
 *   verifyLoginOTP   POST /api/v1/auth/verify-login-otp
 *   signupOTP        POST /api/v1/auth/signup-otp
 *   verifySignupOTP  POST /api/v1/auth/verify-signup-otp
 *   verifyEmail      POST /api/v1/auth/verify-email
 *
 * Turnstile: campo `cf-turnstile-response` opcional no schema (o client já
 * envia no body) + enforceTurnstile() no topo do handler — ver
 * src/orpc/turnstile.ts. CSRF nas verificações, como no original.
 *
 * sendSignupOtpForUnknownUser é cópia da função privada de login.routes.ts
 * (não exportada lá); no cutover o arquivo Igniter morre e esta vira a única.
 */
import { ORPCError } from '@orpc/server'
import crypto from 'crypto'
import { z } from 'zod'
import { database as db } from '@/server/services/database'
import {
  passwordlessOTPSchema,
  verifyPasswordlessOTPSchema,
  signupOTPSchema,
  verifySignupOTPSchema,
  verifyEmailCodeSchema,
} from '../auth.schemas'
import {
  authRateLimiter,
  otpVerifyLoginRateLimiter,
  otpVerifySignupRateLimiter,
  otpVerifyEmailRateLimiter,
} from '@/lib/rate-limit/rate-limiter'
import { checkOtpRateLimit } from '@/lib/rate-limit/otp-rate-limit'
import { generateOTPCode } from '@/lib/auth/bcrypt'
import { signMagicLinkToken } from '@/lib/auth/jwt'
import { UserRole, OrganizationRole } from '@/lib/auth/roles'
import { emailService } from '@/lib/email'
import {
  getClientIdentifier,
  createAuditLog,
  isProduction,
  appBaseUrl,
  dashboardUrl,
  autoJoinByVerifiedDomain,
} from '../_shared/helpers'
import { check2faAndIssueChallenge } from '../_shared/two-factor-gate'
import { finalizeLogin } from '../_shared/finalize-login'
import { issueSession } from '../_shared/issue-session'
import { isSignupEnabled, SIGNUP_DISABLED_MESSAGE } from '../_shared/signup-gate'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { cookieWriter } from '@/orpc/cookies'
import { requireCsrf } from '@/orpc/csrf.middleware'
import { enforceTurnstile } from '@/orpc/turnstile'

const turnstileField = { 'cf-turnstile-response': z.string().optional() }

/** RequestLike com os Headers do contexto (helpers esperam { headers }). */
function reqOf(headers: Headers) {
  return { headers }
}

// ---------------------------------------------------------------------------
// Cópia da função privada de login.routes.ts (branch auto-signup do loginOTP)
// ---------------------------------------------------------------------------
async function sendSignupOtpForUnknownUser(
  email: string,
  response: ReturnType<typeof cookieWriter>,
): Promise<{ sent: true; message: string; isNewUser: true; magicLinkSessionId: string }> {
  const signupOtpCode = generateOTPCode()
  const signupExpiresAt = new Date(Date.now() + 10 * 60 * 1000)
  const tempName = email.split('@')[0]

  await db.tempUser.upsert({
    where: { email },
    create: { email, name: tempName, code: signupOtpCode, expiresAt: signupExpiresAt },
    update: { code: signupOtpCode, expiresAt: signupExpiresAt },
  })

  // C-3: Polling secret — SHA-256 hash stored in DB, plain text in httpOnly cookie
  const signupPollingSecret = crypto.randomBytes(32).toString('hex')
  const signupPollingSecretHash = crypto
    .createHash('sha256')
    .update(signupPollingSecret)
    .digest('hex')

  const signupVerificationCode = await db.verificationCode.create({
    data: {
      identifier: email,
      code: signupOtpCode,
      type: 'MAGIC_LINK',
      token: signupPollingSecretHash,
      expiresAt: signupExpiresAt,
      used: false,
    },
  })

  const signupMagicLinkToken = signMagicLinkToken({
    email,
    tokenId: signupVerificationCode.id,
    type: 'signup',
  })

  await emailService.sendWelcomeSignupEmail(
    email,
    tempName,
    signupOtpCode,
    `${appBaseUrl}/signup/verify-magic?token=${signupMagicLinkToken}`,
    10,
  )

  response.setCookie('mlpoll', signupPollingSecret, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict' as const,
    path: '/api/v1/auth/check-magic-link-status',
    maxAge: 600,
  })

  return {
    sent: true,
    message: 'Código enviado para seu email',
    isNewUser: true,
    magicLinkSessionId: signupVerificationCode.id,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// LOGIN OTP — POST /auth/login-otp (turnstile; branch signup p/ email novo)
// ──────────────────────────────────────────────────────────────────────────
export const loginOTP = base
  .route({
    method: 'POST',
    path: '/auth/login-otp',
    summary: 'Login OTP',
    description: 'Request passwordless login code via email',
  })
  .input(passwordlessOTPSchema.extend(turnstileField))
  .handler(async ({ input, context }) => {
    await enforceTurnstile(context.headers, input['cf-turnstile-response'])

    // Rate limiting (IP-only)
    const identifier = getClientIdentifier(reqOf(context.headers))
    const ipRateLimit = await authRateLimiter.check(identifier)
    if (!ipRateLimit.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many requests',
        data: { retryAfter: ipRateLimit.retryAfter },
      })
    }

    const { email } = input

    // Per-email rate limit to prevent OTP spam to any address
    const emailOtpRateLimit = await checkOtpRateLimit(`send-login-otp:${email}`, identifier)
    if (!emailOtpRateLimit.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message:
          'Too many OTP requests for this email. Please wait before requesting a new code.',
        data: { retryAfter: emailOtpRateLimit.retryAfter },
      })
    }

    const user = await db.user.findUnique({
      where: { email },
      include: { preferences: { select: { otpEmailDisabled: true } } },
    })

    // 2FA + OTP-disabled guard
    if (user && user.twoFactorEnabled && user.preferences?.otpEmailDisabled) {
      throw new ORPCError('FORBIDDEN', {
        message: 'OTP por email desabilitado. Use seu aplicativo autenticador para fazer login.',
        data: { code: 'OTP_EMAIL_DISABLED' },
      })
    }

    // Unknown email → auto-signup branch
    if (!user) {
      const payload = await sendSignupOtpForUnknownUser(email, cookieWriter(context.resHeaders))
      return ok(payload)
    }

    // Known user → login OTP branch
    const otpCode = generateOTPCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    // C-3: Polling secret for tab binding
    const pollingSecret = crypto.randomBytes(32).toString('hex')
    const pollingSecretHash = crypto.createHash('sha256').update(pollingSecret).digest('hex')

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
    })

    const magicLinkToken = signMagicLinkToken({ email, tokenId: verificationCode.id, type: 'login' })
    const magicLinkUrl = `${appBaseUrl}/login/verify-magic?token=${magicLinkToken}`

    await emailService.sendLoginCodeEmail(user.email, user.name, otpCode, magicLinkUrl, 10)

    cookieWriter(context.resHeaders).setCookie('mlpoll', pollingSecret, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict' as const,
      path: '/api/v1/auth/check-magic-link-status',
      maxAge: 600,
    })

    return ok({
      sent: true,
      message: 'Código enviado para seu email',
      magicLinkSessionId: verificationCode.id,
    })
  })

// ──────────────────────────────────────────────────────────────────────────
// VERIFY LOGIN OTP — POST /auth/verify-login-otp (CSRF; 2FA gate)
// ──────────────────────────────────────────────────────────────────────────
export const verifyLoginOTP = base
  .use(requireCsrf)
  .route({
    method: 'POST',
    path: '/auth/verify-login-otp',
    summary: 'Verify Login OTP',
    description: 'Verify passwordless OTP code',
  })
  .input(verifyPasswordlessOTPSchema)
  .handler(async ({ input, context }) => {
    const { email, code } = input

    // Rate limit — 5 attempts / 10 min per IP+email
    const rlIdentifier = `${getClientIdentifier(reqOf(context.headers))}:${email}`
    const rateLimit = await otpVerifyLoginRateLimiter.check(rlIdentifier)
    if (!rateLimit.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many attempts',
        data: { retryAfter: rateLimit.retryAfter },
      })
    }

    // Camada adicional de rate-limit por email
    const clientIp = getClientIdentifier(reqOf(context.headers))
    const otpRateLimit = await checkOtpRateLimit(`verify-login:${email}`, clientIp)
    if (!otpRateLimit.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many attempts',
        data: { retryAfter: otpRateLimit.retryAfter },
      })
    }

    const user = await db.user.findUnique({
      where: { email },
      include: {
        organizations: {
          where: { isActive: true },
          include: { organization: true },
        },
      },
    })

    if (!user) throw new ORPCError('BAD_REQUEST', { message: 'Invalid code' })

    // Atomic compare-and-set: consume token in a single UPDATE (prevents replay race)
    const consumed = await db.verificationCode.updateMany({
      where: { identifier: email, code, type: 'MAGIC_LINK', used: false, expiresAt: { gt: new Date() } },
      data: { used: true },
    })

    if (consumed.count === 0) {
      throw new ORPCError('BAD_REQUEST', { message: 'Invalid or expired code' })
    }
    if (!user.isActive) throw new ORPCError('FORBIDDEN', { message: 'Account disabled' })

    // H-5: 2FA gate — issue challenge, caller finishes TOTP step
    const twoFactorGate = await check2faAndIssueChallenge(user, reqOf(context.headers), 'email-otp')
    if (twoFactorGate) return ok(twoFactorGate)

    // Ensure admin has an org set
    let currentOrgId = user.currentOrgId
    if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
      currentOrgId = user.organizations[0].organizationId
      await db.user.update({ where: { id: user.id }, data: { currentOrgId } })
    }

    const currentOrgRelation = user.organizations.find(
      (org) => org.organizationId === currentOrgId,
    )

    // Device + session + audit — all-in-one happy path
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

// ──────────────────────────────────────────────────────────────────────────
// SIGNUP OTP — POST /auth/signup-otp (turnstile; signup gate)
// ──────────────────────────────────────────────────────────────────────────
export const signupOTP = base
  .route({
    method: 'POST',
    path: '/auth/signup-otp',
    summary: 'Signup OTP',
    description: 'Request signup code via email',
  })
  .input(signupOTPSchema.extend(turnstileField))
  .handler(async ({ input, context }) => {
    await enforceTurnstile(context.headers, input['cf-turnstile-response'])

    if (!isSignupEnabled()) {
      throw new ORPCError('FORBIDDEN', { message: SIGNUP_DISABLED_MESSAGE })
    }

    const identifier = getClientIdentifier(reqOf(context.headers))
    const rateLimit = await authRateLimiter.check(identifier)

    if (!rateLimit.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many requests',
        data: { retryAfter: rateLimit.retryAfter },
      })
    }

    const { email, name } = input

    // Check if user already exists (enumeração-safe: mesma resposta)
    const existingUser = await db.user.findUnique({ where: { email } })
    if (existingUser) {
      return ok({
        sent: true,
        message: 'Se este email não estiver cadastrado, um código será enviado.',
      })
    }

    const otpCode = generateOTPCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await db.tempUser.upsert({
      where: { email },
      create: { email, name, code: otpCode, expiresAt },
      update: { name, code: otpCode, expiresAt },
    })

    const verificationCode = await db.verificationCode.create({
      data: {
        identifier: email,
        code: otpCode,
        type: 'MAGIC_LINK',
        expiresAt,
        used: false,
      },
    })

    const magicLinkToken = signMagicLinkToken({
      email,
      tokenId: verificationCode.id,
      type: 'signup',
      name,
    })

    const magicLinkUrl = `${appBaseUrl}/signup/verify-magic?token=${magicLinkToken}`

    await emailService.sendWelcomeSignupEmail(email, name, otpCode, magicLinkUrl, 10)

    return ok({ sent: true, message: 'Código enviado para seu email' })
  })

// ──────────────────────────────────────────────────────────────────────────
// VERIFY SIGNUP OTP — POST /auth/verify-signup-otp (CSRF)
// ──────────────────────────────────────────────────────────────────────────
export const verifySignupOTP = base
  .use(requireCsrf)
  .route({
    method: 'POST',
    path: '/auth/verify-signup-otp',
    summary: 'Verify Signup OTP',
    description: 'Verify signup OTP and create user',
  })
  .input(verifySignupOTPSchema)
  .handler(async ({ input, context }) => {
    if (!isSignupEnabled()) {
      throw new ORPCError('FORBIDDEN', { message: SIGNUP_DISABLED_MESSAGE })
    }

    const { email, code } = input

    // Rate limit (brute-force protection) — 5 tentativas / 10 min por IP+email
    const rlIdentifier = `${getClientIdentifier(reqOf(context.headers))}:${email}`
    const rateLimit = await otpVerifySignupRateLimiter.check(rlIdentifier)
    if (!rateLimit.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many attempts',
        data: { retryAfter: rateLimit.retryAfter },
      })
    }

    const clientIp = getClientIdentifier(reqOf(context.headers))
    const otpRateLimit = await checkOtpRateLimit(`verify-signup:${email}`, clientIp)
    if (!otpRateLimit.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many attempts',
        data: { retryAfter: otpRateLimit.retryAfter },
      })
    }

    const tempUser = await db.tempUser.findUnique({ where: { email } })

    if (!tempUser || tempUser.code !== code) {
      throw new ORPCError('BAD_REQUEST', { message: 'Código inválido' })
    }

    if (tempUser.expiresAt < new Date()) {
      throw new ORPCError('BAD_REQUEST', { message: 'Código expirado' })
    }

    const existingUser = await db.user.findUnique({ where: { email } })
    if (existingUser) {
      throw new ORPCError('BAD_REQUEST', { message: 'Código inválido' })
    }

    const usersCount = await db.user.count()
    const isFirstUser = usersCount === 0

    const slug = tempUser.name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50)
    const uniqueDocument = crypto.randomUUID().replace(/-/g, '').substring(0, 14)

    const organization = await db.organization.create({
      data: {
        name: `${tempUser.name}'s Organization`,
        slug: `${slug}-${Date.now()}`,
        document: uniqueDocument,
        type: 'pf',
        isActive: true,
      },
    })

    const user = await db.user.create({
      data: {
        email: tempUser.email,
        name: tempUser.name,
        password: null, // Passwordless — magic link user
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
    })

    await db.tempUser.delete({ where: { email } })

    // Auto-join by verified domain (fail-open, non-blocking)
    await autoJoinByVerifiedDomain(user.id, user.email, reqOf(context.headers))

    // Issue full authenticated session (access + refresh JWT + httpOnly cookies).
    await issueSession(
      cookieWriter(context.resHeaders),
      {
        id: user.id,
        email: user.email,
        role: user.role,
        currentOrgId: organization.id,
        onboardingCompleted: user.onboardingCompleted,
      },
      {
        organizationRole: OrganizationRole.MASTER,
        accessTokenExpiry: '24h',
        refreshTokenExpiry: '7d',
      },
    )

    await emailService.sendWelcomeEmail(user.email, user.name, dashboardUrl)

    // Audit logs (fail-open)
    await createAuditLog(
      'user.signup',
      user.id,
      reqOf(context.headers),
      { email: user.email, method: 'email-otp' },
      organization.id,
    )
    await createAuditLog(
      'auth.signup',
      user.id,
      reqOf(context.headers),
      { email: user.email, method: 'email-otp' },
      organization.id,
    )

    return ok({
      needsOnboarding: !user.onboardingCompleted,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        currentOrgId: organization.id,
        organizationRole: 'master',
      },
    })
  })

// ──────────────────────────────────────────────────────────────────────────
// VERIFY EMAIL — POST /auth/verify-email (CSRF)
// ──────────────────────────────────────────────────────────────────────────
export const verifyEmail = base
  .use(requireCsrf)
  .route({
    method: 'POST',
    path: '/auth/verify-email',
    summary: 'Verify Email',
    description: 'Verify email with code',
  })
  .input(verifyEmailCodeSchema)
  .handler(async ({ input, context }) => {
    const { email, code } = input

    const rlIdentifier = `${getClientIdentifier(reqOf(context.headers))}:${email}`
    const rateLimit = await otpVerifyEmailRateLimiter.check(rlIdentifier)
    if (!rateLimit.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many attempts',
        data: { retryAfter: rateLimit.retryAfter },
      })
    }

    const user = await db.user.findUnique({ where: { email } })

    if (!user) throw new ORPCError('BAD_REQUEST', { message: 'Invalid code' })

    if (user.emailVerified) {
      throw new ORPCError('BAD_REQUEST', { message: 'Email already verified' })
    }

    // Atomic compare-and-set: consume the token in a single UPDATE.
    const emailVerificationResult = await db.verificationCode.updateMany({
      where: {
        identifier: email,
        code,
        type: 'EMAIL_VERIFICATION',
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: { used: true },
    })

    if (emailVerificationResult.count === 0) {
      throw new ORPCError('BAD_REQUEST', { message: 'Invalid or expired code' })
    }

    await db.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    })

    // Auto-join by verified domain (fail-open)
    await autoJoinByVerifiedDomain(user.id, user.email, reqOf(context.headers))

    await issueSession(
      cookieWriter(context.resHeaders),
      {
        id: user.id,
        email: user.email,
        role: user.role,
        currentOrgId: user.currentOrgId,
        onboardingCompleted: user.onboardingCompleted,
      },
      { refreshTokenExpiry: '30d' },
    )

    await createAuditLog(
      'user.email_verified',
      user.id,
      reqOf(context.headers),
      { email: user.email },
      user.currentOrgId,
    )

    return ok({
      verified: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })
  })

/** Lote email-otp do namespace auth (api.auth.* no client Igniter). */
export const emailOtpActions = {
  loginOTP,
  verifyLoginOTP,
  signupOTP,
  verifySignupOTP,
  verifyEmail,
}
