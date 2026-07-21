/**
 * Auth/Magic-Link — porta mecânica para oRPC (lote 3a do controller auth).
 *
 * Origem: ./status.routes.ts + ./verify.routes.ts (2 actions).
 *
 * Preservação de URL (basePath /api/v1 + controller /auth + action):
 *   checkMagicLinkStatus  POST /api/v1/auth/check-magic-link-status
 *   verifyMagicLink       POST /api/v1/auth/verify-magic-link
 *
 * Fidelidade: cookie mlpoll comparado por SHA-256 + timingSafeEqual (C-3),
 * consumo atômico do token, gate 2FA na aba original, signup/login paths do
 * verify com os mesmos shapes — tudo reusando os utilitários do app.
 */
import { ORPCError } from '@orpc/server'
import crypto from 'crypto'
import { database as db } from '@/server/services/database'
import { checkMagicLinkStatusSchema, verifyMagicLinkSchema } from '../auth.schemas'
import { checkOtpRateLimit } from '@/lib/rate-limit/otp-rate-limit'
import { UserRole, OrganizationRole } from '@/lib/auth/roles'
import { emailService } from '@/lib/email'
import { authRateLimiter } from '@/lib/rate-limit/rate-limiter'
import { verifyMagicLinkToken } from '@/lib/auth/jwt'
import {
  getClientIdentifier,
  createAuditLog,
  dashboardUrl,
  registerDeviceSession,
  autoJoinByVerifiedDomain,
  sign2faChallenge,
} from '../_shared/helpers'
import { issueSession } from '../_shared/issue-session'
import { check2faAndIssueChallenge } from '../_shared/two-factor-gate'
import { finalizeLogin } from '../_shared/finalize-login'
import { isSignupEnabled, SIGNUP_DISABLED_MESSAGE } from '../_shared/signup-gate'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { cookieWriter } from '@/orpc/cookies'

function reqOf(headers: Headers) {
  return { headers }
}

function tooMany(retryAfter?: number): ORPCError<'TOO_MANY_REQUESTS', { retryAfter?: number }> {
  return new ORPCError('TOO_MANY_REQUESTS', {
    message: 'Too many requests',
    data: { retryAfter },
  })
}

// ──────────────────────────────────────────────────────────────────────────
// CHECK STATUS — POST /auth/check-magic-link-status (polling cross-tab)
// ──────────────────────────────────────────────────────────────────────────
export const checkMagicLinkStatus = base
  .route({
    method: 'POST',
    path: '/auth/check-magic-link-status',
    summary: 'Check Magic Link Status',
    description: 'Poll to check if magic link was verified (for cross-tab login)',
  })
  .input(checkMagicLinkStatusSchema)
  .handler(async ({ input, context }) => {
    const { sessionId } = input

    const identifier = getClientIdentifier(reqOf(context.headers))
    const rateLimit = await authRateLimiter.check(`mlpoll:${identifier}`)
    if (!rateLimit.success) throw tooMany(rateLimit.retryAfter)

    // C-3: cookie mlpoll — segredo plain-text da aba originadora
    const cookieHeader = context.headers.get('cookie') ?? ''
    const mlpollCookie = cookieHeader
      .split(';')
      .map((c: string) => c.trim())
      .find((c: string) => c.startsWith('mlpoll='))
      ?.slice('mlpoll='.length)

    if (!mlpollCookie) throw new ORPCError('FORBIDDEN', { message: 'Forbidden' })

    const verificationCode = await db.verificationCode.findUnique({
      where: { id: sessionId },
    })

    if (!verificationCode) throw new ORPCError('FORBIDDEN', { message: 'Forbidden' })

    // Comparação constante do segredo contra o hash SHA-256 armazenado
    if (!verificationCode.token) {
      throw new ORPCError('FORBIDDEN', { message: 'Forbidden' })
    }
    const expectedHash = crypto.createHash('sha256').update(mlpollCookie).digest('hex')
    const expectedBuf = Buffer.from(expectedHash, 'utf8')
    const actualBuf = Buffer.from(verificationCode.token, 'utf8')
    const lengthMatch = expectedBuf.length === actualBuf.length
    const secretMatch = lengthMatch && crypto.timingSafeEqual(expectedBuf, actualBuf)
    if (!secretMatch) throw new ORPCError('FORBIDDEN', { message: 'Forbidden' })

    if (verificationCode.expiresAt < new Date()) {
      return ok({ verified: false, expired: true })
    }

    if (!verificationCode.used) {
      return ok({ verified: false, expired: false })
    }

    // Magic link verificado em outra aba — autenticar esta também
    const user = await db.user.findUnique({
      where: { email: verificationCode.identifier },
      include: {
        organizations: {
          where: { isActive: true },
          include: { organization: true },
        },
      },
    })

    if (!user) throw new ORPCError('NOT_FOUND', { message: 'User not found' })
    if (!user.isActive) throw new ORPCError('FORBIDDEN', { message: 'Account disabled' })

    // A aba original NÃO contorna 2FA
    if (user.twoFactorEnabled) {
      const challengeId = sign2faChallenge(user.id)
      return ok({ verified: true, requiresTwoFactor: true, challengeId })
    }

    let currentOrgId = user.currentOrgId
    if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
      currentOrgId = user.organizations[0].organizationId
      await db.user.update({ where: { id: user.id }, data: { currentOrgId } })
    }

    const currentOrgRelation = user.organizations.find(
      (org) => org.organizationId === currentOrgId,
    )

    await issueSession(
      cookieWriter(context.resHeaders),
      {
        id: user.id,
        email: user.email,
        role: user.role as UserRole,
        currentOrgId,
        onboardingCompleted: user.onboardingCompleted,
      },
      {
        organizationRole: currentOrgRelation?.role as never,
        accessTokenExpiry: '24h',
        refreshTokenExpiry: '7d',
      },
    )

    await registerDeviceSession(user.id, reqOf(context.headers))

    const redirectPath = '/'

    return ok({
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
    })
  })

// ──────────────────────────────────────────────────────────────────────────
// VERIFY — POST /auth/verify-magic-link (signup ou login pelo payload.type)
// ──────────────────────────────────────────────────────────────────────────
export const verifyMagicLink = base
  .route({
    method: 'POST',
    path: '/auth/verify-magic-link',
    summary: 'Verify Magic Link',
    description: 'Verify magic link token (login or signup)',
  })
  .input(verifyMagicLinkSchema)
  .handler(async ({ input, context }) => {
    const identifier = getClientIdentifier(reqOf(context.headers))
    const rateLimit = await authRateLimiter.check(`verify-magic:${identifier}`)
    if (!rateLimit.success) throw tooMany(rateLimit.retryAfter)

    const { token } = input

    const payload = verifyMagicLinkToken(token)
    if (!payload) {
      throw new ORPCError('BAD_REQUEST', { message: 'Invalid or expired magic link' })
    }

    const rateLimitIdentifier = payload.email || identifier
    const otpRateLimit = await checkOtpRateLimit(rateLimitIdentifier, identifier)
    if (!otpRateLimit.success) throw tooMany(otpRateLimit.retryAfter)

    // Consumo atômico (previne replay em corrida)
    const consumeResult = await db.verificationCode.updateMany({
      where: {
        id: payload.tokenId,
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: { used: true },
    })

    if (consumeResult.count === 0) {
      const existing = await db.verificationCode.findUnique({
        where: { id: payload.tokenId },
        select: { used: true, expiresAt: true },
      })
      if (!existing) {
        throw new ORPCError('BAD_REQUEST', { message: 'Magic link already used or expired' })
      }
      if (existing.expiresAt < new Date()) {
        throw new ORPCError('BAD_REQUEST', { message: 'Magic link expired' })
      }
      throw new ORPCError('BAD_REQUEST', { message: 'Magic link already used or expired' })
    }

    // ── SIGNUP PATH ──
    if (payload.type === 'magic-link-signup') {
      if (!isSignupEnabled()) {
        throw new ORPCError('FORBIDDEN', { message: SIGNUP_DISABLED_MESSAGE })
      }

      const existingUser = await db.user.findUnique({ where: { email: payload.email } })
      if (existingUser) {
        throw new ORPCError('BAD_REQUEST', { message: 'Usuário já existe' })
      }

      const tempUser = await db.tempUser.findUnique({ where: { email: payload.email } })
      if (!tempUser) {
        throw new ORPCError('BAD_REQUEST', { message: 'Signup data not found' })
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
          password: null, // Passwordless — magic-link signup user
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

      await db.tempUser.delete({ where: { email: payload.email } })

      await autoJoinByVerifiedDomain(user.id, user.email, reqOf(context.headers))

      await issueSession(
        cookieWriter(context.resHeaders),
        {
          id: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId: organization.id,
          onboardingCompleted: user.onboardingCompleted,
        },
        {
          organizationRole: OrganizationRole.MASTER,
          accessTokenExpiry: '24h',
          refreshTokenExpiry: '7d',
        },
      )

      await registerDeviceSession(user.id, reqOf(context.headers))

      await emailService.sendWelcomeEmail(user.email, user.name, dashboardUrl)

      await createAuditLog(
        'auth.signup',
        user.id,
        reqOf(context.headers),
        { method: 'magic-link' },
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
    }

    // ── LOGIN PATH ──
    if (payload.type === 'magic-link-login') {
      const user = await db.user.findUnique({
        where: { email: payload.email },
        include: {
          organizations: {
            where: { isActive: true },
            include: { organization: true },
          },
        },
      })

      if (!user) throw new ORPCError('NOT_FOUND', { message: 'User not found' })
      if (!user.isActive) throw new ORPCError('FORBIDDEN', { message: 'Account disabled' })

      const twoFaChallenge = await check2faAndIssueChallenge(
        user,
        reqOf(context.headers),
        'magic-link',
      )
      if (twoFaChallenge) return ok(twoFaChallenge)

      let currentOrgId = user.currentOrgId
      if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
        currentOrgId = user.organizations[0].organizationId
        await db.user.update({ where: { id: user.id }, data: { currentOrgId } })
      }

      const currentOrgRelation = user.organizations.find(
        (org) => org.organizationId === currentOrgId,
      )

      const loginResult = await finalizeLogin({
        user: {
          id: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId,
          onboardingCompleted: user.onboardingCompleted,
        },
        request: reqOf(context.headers),
        response: cookieWriter(context.resHeaders),
        method: 'magic-link',
        auditEvents: [{ action: 'auth.login' }],
        issueOptions: {
          organizationRole: currentOrgRelation?.role as never,
          accessTokenExpiry: '24h',
          refreshTokenExpiry: '7d',
        },
      })

      if (loginResult.blocked) {
        throw new ORPCError('FORBIDDEN', { message: 'Login blocked by security policy' })
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
    }

    throw new ORPCError('BAD_REQUEST', { message: 'Invalid magic link type' })
  })

/** Lote magic-link do namespace auth (api.auth.* no client Igniter). */
export const magicLinkActions = {
  checkMagicLinkStatus,
  verifyMagicLink,
}
