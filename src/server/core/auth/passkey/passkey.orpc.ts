/**
 * Auth/Passkey — porta mecânica para oRPC (lote 4d, último do controller auth).
 *
 * Origem: ./register.routes.ts + ./login.routes.ts + ./conditional.routes.ts
 * (8 actions), reusando ./passkey.shared.ts (config WebAuthn + schemas) e o
 * @simplewebauthn/server do app.
 *
 * Preservação de URL (basePath /api/v1 + controller /auth + action):
 *   passkeyRegisterOptions       POST   /api/v1/auth/passkey/register/options
 *   passkeyRegisterVerify        POST   /api/v1/auth/passkey/register/verify
 *   passkeyList                  GET    /api/v1/auth/passkey/list
 *   passkeyDelete                DELETE /api/v1/auth/passkey/:passkeyId
 *   passkeyLoginOptions          POST   /api/v1/auth/passkey/login/options
 *   passkeyLoginVerify           POST   /api/v1/auth/passkey/login/verify
 *   passkeyConditionalChallenge  POST   /api/v1/auth/passkey/login/challenge
 *   passkeyConditionalVerify     POST   /api/v1/auth/passkey/login/verify-conditional
 *
 * Fidelidade: challenges single-use com TTL de 5 min (delete+create por
 * tipo), excludeCredentials no registro, counter/lastUsedAt atualizados na
 * autenticação, resposta anti-enumeração no login/options, passkey como
 * PRIMEIRO fator apenas (gate 2FA antes da sessão), finalizeLogin nos
 * caminhos felizes. Precedência: /passkey/{login,register,list} estáticos
 * vencem /passkey/{passkeyId}.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { database as db } from '@/server/services/database'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { getClientIdentifier, createAuditLog } from '../_shared/helpers'
import { check2faAndIssueChallenge } from '../_shared/two-factor-gate'
import { finalizeLogin } from '../_shared/finalize-login'
import { RateLimiter } from '@/lib/rate-limit/rate-limiter'
import {
  getWebAuthnConfig,
  webauthnRegistrationResponseSchema,
  webauthnAuthenticationResponseSchema,
} from './passkey.shared'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { cookieWriter } from '@/orpc/cookies'
import { requireAuth } from '@/orpc/auth.middleware'
import { requireCsrf } from '@/orpc/csrf.middleware'

// ── Rate limiters (mesmas configs/prefixos dos originais) ──────────────────
const passkeyLoginOptionsLimiter = new RateLimiter({
  limit: 10, window: 600, prefix: 'passkey-login-options', failClosedInProduction: true,
})
const passkeyLoginVerifyLimiter = new RateLimiter({
  limit: 10, window: 600, prefix: 'passkey-login-verify', failClosedInProduction: true,
})
const passkeyLoginChallengeLimiter = new RateLimiter({
  limit: 10, window: 600, prefix: 'passkey-login-challenge', failClosedInProduction: true,
})
const passkeyLoginVerifyCondLimiter = new RateLimiter({
  limit: 10, window: 600, prefix: 'passkey-login-verify-cond', failClosedInProduction: true,
})

const authed = base.use(requireAuth)
const authedCsrf = authed.use(requireCsrf)

function reqOf(headers: Headers) {
  return { headers }
}

function userOf(context: { auth: { session: { user: unknown } } }) {
  const user = context.auth.session.user as {
    id: string
    email: string
    name: string | null
    currentOrgId: string | null
  } | null
  if (!user) throw new ORPCError('UNAUTHORIZED', { message: 'Authentication required' })
  return user
}

async function checkLimiter(limiter: RateLimiter, identifier: string) {
  const rl = await limiter.check(identifier)
  if (!rl.success) {
    throw new ORPCError('TOO_MANY_REQUESTS', {
      message: 'Too many requests',
      data: { retryAfter: rl.retryAfter },
    })
  }
}

// ──────────────────────────────────────────────────────────────────────────
// REGISTER OPTIONS — POST /auth/passkey/register/options
// ──────────────────────────────────────────────────────────────────────────
export const passkeyRegisterOptions = authedCsrf
  .route({
    method: 'POST',
    path: '/auth/passkey/register/options',
    summary: 'Passkey Register Options',
  })
  .handler(async ({ context }) => {
    const user = userOf(context)

    const existingCredentials = await db.passkeyCredential.findMany({
      where: { userId: user.id },
    })

    const { rpId: rpID } = getWebAuthnConfig()
    const options = await generateRegistrationOptions({
      rpName: process.env.APP_NAME || 'Quayer',
      rpID,
      userName: user.email,
      userDisplayName: user.name || user.email,
      excludeCredentials: existingCredentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    })

    await db.passkeyChallenge.deleteMany({
      where: { userId: user.id, type: 'registration' },
    })
    await db.passkeyChallenge.create({
      data: {
        challenge: options.challenge,
        userId: user.id,
        type: 'registration',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    })

    return ok(options)
  })

// ──────────────────────────────────────────────────────────────────────────
// REGISTER VERIFY — POST /auth/passkey/register/verify
// ──────────────────────────────────────────────────────────────────────────
export const passkeyRegisterVerify = authedCsrf
  .route({
    method: 'POST',
    path: '/auth/passkey/register/verify',
    summary: 'Passkey Register Verify',
  })
  .input(
    z.object({
      response: webauthnRegistrationResponseSchema,
      name: z.string().optional().default('Minha Passkey'),
    }),
  )
  .handler(async ({ input, context }) => {
    const user = userOf(context)

    const challenge = await db.passkeyChallenge.findFirst({
      where: { userId: user.id, type: 'registration', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!challenge) {
      throw new ORPCError('BAD_REQUEST', { message: 'Challenge não encontrado ou expirado' })
    }

    const { rpId: rpID, origin } = getWebAuthnConfig()

    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response: input.response as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    })

    if (!verified || !registrationInfo) {
      throw new ORPCError('BAD_REQUEST', { message: 'Verificação de passkey falhou' })
    }

    const { credential } = registrationInfo
    const created = await db.passkeyCredential.create({
      data: {
        userId: user.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        credentialDeviceType: registrationInfo.credentialDeviceType,
        credentialBackedUp: registrationInfo.credentialBackedUp,
        transports: credential.transports || [],
        name: input.name,
        aaguid: registrationInfo.aaguid,
      },
    })

    await db.passkeyChallenge.delete({ where: { id: challenge.id } })

    await createAuditLog(
      'passkey.registered',
      user.id,
      reqOf(context.headers),
      {
        passkeyId: created.id,
        credentialId: credential.id,
        name: input.name,
        deviceType: registrationInfo.credentialDeviceType,
      },
      user.currentOrgId,
    )

    return ok({ verified: true, credentialId: credential.id })
  })

// ──────────────────────────────────────────────────────────────────────────
// LIST — GET /auth/passkey/list (sem CSRF: leitura)
// ──────────────────────────────────────────────────────────────────────────
export const passkeyList = authed
  .route({ method: 'GET', path: '/auth/passkey/list', summary: 'Passkey List' })
  .handler(async ({ context }) => {
    const user = userOf(context)

    const credentials = await db.passkeyCredential.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        credentialId: true,
        credentialDeviceType: true,
        credentialBackedUp: true,
        transports: true,
        name: true,
        aaguid: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return ok(credentials)
  })

// ──────────────────────────────────────────────────────────────────────────
// DELETE — DELETE /auth/passkey/{passkeyId}
// ──────────────────────────────────────────────────────────────────────────
export const passkeyDelete = authedCsrf
  .route({ method: 'DELETE', path: '/auth/passkey/{passkeyId}', summary: 'Passkey Delete' })
  .input(z.object({ passkeyId: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const user = userOf(context)
    const { passkeyId } = input

    const credential = await db.passkeyCredential.findFirst({
      where: { id: passkeyId, userId: user.id },
    })
    if (!credential) throw new ORPCError('NOT_FOUND', { message: 'Passkey não encontrada' })

    await db.passkeyCredential.delete({ where: { id: passkeyId } })

    await createAuditLog(
      'passkey.deleted',
      user.id,
      reqOf(context.headers),
      {
        passkeyId,
        credentialId: credential.credentialId,
        name: credential.name,
      },
      user.currentOrgId,
    )

    return ok({ deleted: true })
  })

// ──────────────────────────────────────────────────────────────────────────
// LOGIN OPTIONS — POST /auth/passkey/login/options (público)
// ──────────────────────────────────────────────────────────────────────────
export const passkeyLoginOptions = base
  .route({
    method: 'POST',
    path: '/auth/passkey/login/options',
    summary: 'Passkey Login Options',
  })
  .input(z.object({ email: z.string().email() }))
  .handler(async ({ input, context }) => {
    const { email } = input
    const clientIp = getClientIdentifier(reqOf(context.headers))
    const rlIdentifier = email ? `${email}:${clientIp}` : clientIp
    await checkLimiter(passkeyLoginOptionsLimiter, rlIdentifier)

    const user = await db.user.findUnique({
      where: { email },
      include: { passkeyCredentials: true },
    })

    // Anti-enumeração: mesma mensagem para user inexistente ou sem passkeys
    if (!user || user.passkeyCredentials.length === 0) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Não foi possível completar a autenticação com passkey',
      })
    }

    const { rpId: rpID } = getWebAuthnConfig()
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: user.passkeyCredentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports as AuthenticatorTransportFuture[],
      })),
      userVerification: 'preferred',
    })

    await db.passkeyChallenge.deleteMany({
      where: { userId: user.id, type: 'authentication' },
    })
    await db.passkeyChallenge.create({
      data: {
        challenge: options.challenge,
        userId: user.id,
        email: user.email,
        type: 'authentication',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    })

    return ok({ ...options, userId: user.id })
  })

// ──────────────────────────────────────────────────────────────────────────
// LOGIN VERIFY — POST /auth/passkey/login/verify (CSRF)
// ──────────────────────────────────────────────────────────────────────────
export const passkeyLoginVerify = base
  .use(requireCsrf)
  .route({
    method: 'POST',
    path: '/auth/passkey/login/verify',
    summary: 'Passkey Login Verify',
  })
  .input(
    z.object({ email: z.string().email(), response: webauthnAuthenticationResponseSchema }),
  )
  .handler(async ({ input, context }) => {
    const { email } = input
    const clientIp = getClientIdentifier(reqOf(context.headers))
    const rlIdentifier = email ? `${email}:${clientIp}` : clientIp
    await checkLimiter(passkeyLoginVerifyLimiter, rlIdentifier)

    const user = await db.user.findUnique({
      where: { email },
      include: {
        passkeyCredentials: true,
        organizations: {
          where: { isActive: true },
          include: { organization: true },
          take: 1,
        },
      },
    })

    if (!user) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Não foi possível completar a autenticação com passkey',
      })
    }

    const challenge = await db.passkeyChallenge.findFirst({
      where: { userId: user.id, type: 'authentication', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!challenge) {
      throw new ORPCError('BAD_REQUEST', { message: 'Challenge não encontrado ou expirado' })
    }

    const credential = user.passkeyCredentials.find(
      (c) => c.credentialId === input.response.id,
    )
    if (!credential) throw new ORPCError('BAD_REQUEST', { message: 'Passkey não encontrada' })

    const { rpId: rpID, origin } = getWebAuthnConfig()

    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response: input.response as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey as Buffer),
        counter: Number(credential.counter),
        transports: credential.transports as AuthenticatorTransportFuture[],
      },
    })

    if (!verified) {
      throw new ORPCError('BAD_REQUEST', { message: 'Autenticação com passkey falhou' })
    }

    await db.passkeyCredential.update({
      where: { id: credential.id },
      data: { counter: BigInt(authenticationInfo.newCounter), lastUsedAt: new Date() },
    })
    await db.passkeyChallenge.delete({ where: { id: challenge.id } })

    // H-5: passkey é só o PRIMEIRO fator; TOTP continua exigido
    const twoFaPayload = await check2faAndIssueChallenge(user, reqOf(context.headers), 'passkey')
    if (twoFaPayload) return ok(twoFaPayload)

    const result = await finalizeLogin({
      user,
      request: reqOf(context.headers),
      response: cookieWriter(context.resHeaders),
      method: 'passkey',
      auditEvents: [{ action: 'user.login', metadata: { passkeyId: credential.id } }],
    })

    if (result.blocked) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Login bloqueado por política de segurança. Contate o administrador.',
      })
    }

    return ok({
      needsOnboarding: !user.onboardingCompleted,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })
  })

// ──────────────────────────────────────────────────────────────────────────
// CONDITIONAL CHALLENGE — POST /auth/passkey/login/challenge (público)
// ──────────────────────────────────────────────────────────────────────────
export const passkeyConditionalChallenge = base
  .route({
    method: 'POST',
    path: '/auth/passkey/login/challenge',
    summary: 'Passkey Conditional Challenge',
  })
  .handler(async ({ context }) => {
    const clientIp = getClientIdentifier(reqOf(context.headers))
    await checkLimiter(passkeyLoginChallengeLimiter, clientIp)

    const options = await generateAuthenticationOptions({
      rpID: getWebAuthnConfig().rpId,
      allowCredentials: [],
      userVerification: 'preferred',
    })

    const challenge = await db.passkeyChallenge.create({
      data: {
        challenge: options.challenge,
        userId: null,
        email: null,
        type: 'conditional',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    })

    return ok({ ...options, challengeId: challenge.id })
  })

// ──────────────────────────────────────────────────────────────────────────
// CONDITIONAL VERIFY — POST /auth/passkey/login/verify-conditional (CSRF)
// ──────────────────────────────────────────────────────────────────────────
export const passkeyConditionalVerify = base
  .use(requireCsrf)
  .route({
    method: 'POST',
    path: '/auth/passkey/login/verify-conditional',
    summary: 'Passkey Conditional Verify',
  })
  .input(
    z.object({ response: webauthnAuthenticationResponseSchema, challengeId: z.string() }),
  )
  .handler(async ({ input, context }) => {
    const clientIp = getClientIdentifier(reqOf(context.headers))
    await checkLimiter(passkeyLoginVerifyCondLimiter, clientIp)

    // 1. Challenge
    const challenge = await db.passkeyChallenge.findFirst({
      where: { id: input.challengeId, type: 'conditional', expiresAt: { gt: new Date() } },
    })
    if (!challenge) {
      throw new ORPCError('BAD_REQUEST', { message: 'Challenge inválido ou expirado' })
    }

    // 2. Credential
    const credential = await db.passkeyCredential.findFirst({
      where: { credentialId: input.response.id },
      include: {
        user: {
          include: {
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
          },
        },
      },
    })
    if (!credential) throw new ORPCError('BAD_REQUEST', { message: 'Passkey não reconhecida' })

    const user = credential.user

    // 3. Verificação WebAuthn
    const { rpId: conditionalRpId, origin: conditionalOrigin } = getWebAuthnConfig()
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response: input.response as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: conditionalOrigin,
      expectedRPID: conditionalRpId,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey as Buffer),
        counter: Number(credential.counter),
        transports: credential.transports as AuthenticatorTransportFuture[],
      },
    })

    if (!verified) {
      throw new ORPCError('BAD_REQUEST', { message: 'Autenticação com passkey falhou' })
    }

    // 4. Single-use: apaga challenge e atualiza counter/lastUsedAt
    await db.passkeyChallenge.delete({ where: { id: challenge.id } })
    await db.passkeyCredential.update({
      where: { id: credential.id },
      data: { counter: BigInt(authenticationInfo.newCounter), lastUsedAt: new Date() },
    })

    // H-5: gate 2FA
    const twoFaPayload = await check2faAndIssueChallenge(
      user,
      reqOf(context.headers),
      'passkey-conditional',
    )
    if (twoFaPayload) return ok(twoFaPayload)

    const result = await finalizeLogin({
      user,
      request: reqOf(context.headers),
      response: cookieWriter(context.resHeaders),
      method: 'passkey-conditional',
      auditEvents: [{ action: 'user.login', metadata: { passkeyId: credential.id } }],
    })

    if (result.blocked) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Login bloqueado por política de segurança. Contate o administrador.',
      })
    }

    return ok({
      needsOnboarding: !user.onboardingCompleted,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })
  })

/** Lote passkey do namespace auth (api.auth.* no client Igniter). */
export const passkeyActions = {
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  passkeyList,
  passkeyDelete,
  passkeyLoginOptions,
  passkeyLoginVerify,
  passkeyConditionalChallenge,
  passkeyConditionalVerify,
}
