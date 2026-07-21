/**
 * Auth/OAuth-Google — porta mecânica para oRPC (lote 3b do controller auth).
 *
 * Origem: ./oauth-google.controller.ts (2 actions).
 *
 * Preservação de URL (basePath /api/v1 + controller /auth + action):
 *   googleAuth      GET  /api/v1/auth/google
 *   googleCallback  POST /api/v1/auth/google/callback
 *
 * Fidelidade: state CSRF em cookie httpOnly com comparação timing-safe e
 * invalidação one-shot; verificação de email por tipo de conta (Workspace
 * via hd); signup gate; identidade OAuth via userIdentity.upsert; gate 2FA
 * para usuário existente; signup path com issueSession manual e login path
 * via finalizeLogin — shapes preservados. Rate limiters com os MESMOS
 * prefixos (limite compartilhado via Redis com o Igniter vivo).
 */
import { ORPCError } from '@orpc/server'
import crypto from 'crypto'
import { database as db } from '@/server/services/database'
import { googleCallbackSchema } from '../auth.schemas'
import { UserRole } from '@/lib/auth/roles'
import { emailService } from '@/lib/email'
import { RateLimiter } from '@/lib/rate-limit/rate-limiter'
import {
  getClientIdentifier,
  createAuditLog,
  dashboardUrl,
  isProduction,
  registerDeviceSession,
} from '../_shared/helpers'
import { isSignupEnabled, SIGNUP_DISABLED_MESSAGE } from '../_shared/signup-gate'
import { issueSession } from '../_shared/issue-session'
import { check2faAndIssueChallenge } from '../_shared/two-factor-gate'
import { finalizeLogin } from '../_shared/finalize-login'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { cookieWriter } from '@/orpc/cookies'

/** Mesmas configs/prefixos do controller original. */
const oauthGoogleCallbackRateLimiter = new RateLimiter({
  limit: 10,
  window: 600,
  prefix: 'ratelimit:oauth-google-callback',
  failClosedInProduction: true,
})

const oauthGoogleInitRateLimiter = new RateLimiter({
  limit: 20,
  window: 600,
  prefix: 'ratelimit:oauth-google-init',
  failClosedInProduction: true,
})

function reqOf(headers: Headers) {
  return { headers }
}

// ──────────────────────────────────────────────────────────────────────────
// GOOGLE AUTH — GET /auth/google (inicia o fluxo; state CSRF em cookie)
// ──────────────────────────────────────────────────────────────────────────
export const googleAuth = base
  .route({
    method: 'GET',
    path: '/auth/google',
    summary: 'Google Auth',
    description: 'Initiate Google OAuth flow',
  })
  .handler(async ({ context }) => {
    const rl = await oauthGoogleInitRateLimiter.check(getClientIdentifier(reqOf(context.headers)))
    if (!rl.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many requests',
        data: { retryAfter: rl.retryAfter },
      })
    }

    // State CSRF criptograficamente aleatório (64 hex)
    const state = crypto.randomBytes(32).toString('hex')

    cookieWriter(context.resHeaders).setCookie('oauth_google_state', state, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 600, // 10 minutes — enough for the OAuth round-trip
    })

    const { getGoogleAuthUrl } = await import('@/lib/auth/google-oauth')
    const authUrl = getGoogleAuthUrl(state)
    return ok({ authUrl })
  })

// ──────────────────────────────────────────────────────────────────────────
// GOOGLE CALLBACK — POST /auth/google/callback
// ──────────────────────────────────────────────────────────────────────────
export const googleCallback = base
  .route({
    method: 'POST',
    path: '/auth/google/callback',
    summary: 'Google Callback',
    description: 'Process Google OAuth callback',
  })
  .input(googleCallbackSchema)
  .handler(async ({ input, context }) => {
    const rl = await oauthGoogleCallbackRateLimiter.check(
      getClientIdentifier(reqOf(context.headers)),
    )
    if (!rl.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many requests',
        data: { retryAfter: rl.retryAfter },
      })
    }

    const { code, state } = input
    const { getGoogleTokens, getGoogleUserInfo } = await import('@/lib/auth/google-oauth')

    // --- CSRF state validation (Login-CSRF prevention) ---
    const cookieHeader = context.headers.get('cookie') || ''
    const cookieState =
      cookieHeader
        .split(';')
        .map((c: string) => c.trim())
        .find((c: string) => c.startsWith('oauth_google_state='))
        ?.split('=')
        .slice(1)
        .join('=') ?? ''

    if (!cookieState || cookieState.length !== state.length) {
      console.error('[Google OAuth] State mismatch — possible CSRF attack')
      throw new ORPCError('FORBIDDEN', { message: 'Invalid OAuth state' })
    }

    const stateMatches = crypto.timingSafeEqual(
      Buffer.from(cookieState, 'utf8'),
      Buffer.from(state, 'utf8'),
    )

    if (!stateMatches) {
      console.error('[Google OAuth] State mismatch — possible CSRF attack')
      throw new ORPCError('FORBIDDEN', { message: 'Invalid OAuth state' })
    }

    // Invalida o cookie de state (one-shot)
    cookieWriter(context.resHeaders).setCookie('oauth_google_state', '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 0,
    })
    // --- end CSRF validation ---

    try {
      const tokens = await getGoogleTokens(code)

      if (!tokens.access_token) {
        console.error('[Google OAuth] access_token missing from token exchange response')
        throw new ORPCError('BAD_REQUEST', { message: 'Failed to get access token' })
      }

      const googleUser = await getGoogleUserInfo(tokens.access_token)

      // Workspace: verified_email pode vir ausente, mas hd presente implica
      // conta ativa/verificada — só rejeita quando explicitamente false.
      const isWorkspaceAccount = typeof googleUser.hd === 'string' && googleUser.hd.length > 0
      if (googleUser.verified_email === false && !isWorkspaceAccount) {
        console.error('[Google OAuth] Provider returned unverified email; rejecting')
        throw new ORPCError('BAD_REQUEST', { message: 'Google email not verified' })
      }

      let user = await db.user.findUnique({
        where: { email: googleUser.email },
      })

      let isNewGoogleUser = false

      if (!user) {
        if (!isSignupEnabled()) {
          throw new ORPCError('FORBIDDEN', { message: SIGNUP_DISABLED_MESSAGE })
        }

        const usersCount = await db.user.count()
        const isFirstUser = usersCount === 0

        const slug = googleUser.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .substring(0, 50)

        const uniqueDocument = crypto.randomUUID().replace(/-/g, '').substring(0, 14)

        const organization = await db.organization.create({
          data: {
            name: `${googleUser.name}'s Organization`,
            slug: `${slug}-${Date.now()}`,
            document: uniqueDocument,
            type: 'pf',
            isActive: true,
          },
        })

        user = await db.user.create({
          data: {
            email: googleUser.email,
            name: googleUser.name,
            password: null, // Passwordless — OAuth user
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
        isNewGoogleUser = true
      }

      // Registrar/atualizar identidade OAuth vinculada ao usuário
      await db.userIdentity.upsert({
        where: {
          provider_providerUserId: {
            provider: 'google',
            providerUserId: googleUser.sub,
          },
        },
        create: {
          userId: user.id,
          provider: 'google',
          providerUserId: googleUser.sub,
          identifier: googleUser.email,
        },
        update: {
          lastUsedAt: new Date(),
        },
      })

      // 2FA gate: usuário existente com TOTP ativo recebe challenge
      if (!isNewGoogleUser) {
        const twoFactorGate = await check2faAndIssueChallenge(
          user,
          reqOf(context.headers),
          'google',
        )
        if (twoFactorGate) return ok(twoFactorGate)
      }

      // --- Caminho SIGNUP (novo usuário) ---
      if (isNewGoogleUser) {
        await issueSession(cookieWriter(context.resHeaders), user)

        await emailService.sendWelcomeEmail(user.email, user.name, dashboardUrl)
        await createAuditLog(
          'user.signup',
          user.id,
          reqOf(context.headers),
          { method: 'google' },
          user.currentOrgId,
        )
        await createAuditLog(
          'auth.signup',
          user.id,
          reqOf(context.headers),
          { method: 'google' },
          user.currentOrgId,
        )

        // Device session non-blocking (signup path: sem geo-block)
        await registerDeviceSession(user.id, reqOf(context.headers))

        return ok({
          needsOnboarding: !user.onboardingCompleted,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            currentOrgId: user.currentOrgId,
          },
        })
      }

      // --- Caminho LOGIN (usuário existente, sem 2FA) ---
      const loginResult = await finalizeLogin({
        user,
        request: reqOf(context.headers),
        response: cookieWriter(context.resHeaders),
        method: 'google',
        auditEvents: [{ action: 'user.login' }, { action: 'auth.login' }],
      })

      if (loginResult.blocked) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Login bloqueado por política geográfica da organização',
        })
      }

      return ok({
        needsOnboarding: !user.onboardingCompleted,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          currentOrgId: user.currentOrgId,
        },
      })
    } catch (error) {
      if (error instanceof ORPCError) throw error
      const err = error as Error
      // Não logar error.message em produção — pode conter PII do provider
      if (process.env.NODE_ENV === 'development') {
        console.error('[Google OAuth] Authentication failed:', err.message)
      } else {
        console.error('[Google OAuth] Authentication failed')
      }
      throw new ORPCError('BAD_REQUEST', {
        message: 'Google authentication failed',
        data: {
          message: err.message || 'Erro ao processar autenticação com Google',
          details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        },
      })
    }
  })

/** Lote oauth-google do namespace auth (api.auth.* no client Igniter). */
export const oauthGoogleActions = {
  googleAuth,
  googleCallback,
}
