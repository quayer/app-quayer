/**
 * Auth/Passkey (oRPC) — teste in-process do lote 4d (último do auth).
 *
 * Cobre: ciclo de registro (challenge single-use + excludeCredentials +
 * audit), lista/delete com posse, login com email (anti-enumeração, counter
 * atualizado, gate 2FA, sessão) e o fluxo conditional (challenge anônimo).
 * O @simplewebauthn/server é mockado (verificação criptográfica exige
 * authenticator real).
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'
process.env.JWT_REFRESH_SECRET = 'orpc-spike-test-refresh-0123456789-abcdefgh'
process.env.JWT_2FA_CHALLENGE_SECRET = 'orpc-spike-test-2fa-chall-0123456789-abcde'

vi.mock('@/server/services/database', () => ({
  database: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    customRole: { findUnique: vi.fn() },
    passkeyCredential: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    passkeyChallenge: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    refreshToken: { create: vi.fn(), update: vi.fn() },
    deviceSession: { create: vi.fn(), findMany: vi.fn() },
    notification: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock('@/server/services/redis', () => ({ getRedis: vi.fn() }))
vi.mock('@/lib/geocoding/ip-geolocation', () => ({
  getIpGeolocation: vi.fn().mockResolvedValue({ countryCode: 'XX', country: 'Unknown', city: null }),
}))
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}))

import { database } from '@/server/services/database'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { signAccessToken } from '@/lib/auth/jwt'
import { POST, DELETE } from '@/app/api/orpc/[[...rest]]/route'

const db = database as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const genRegOpts = generateRegistrationOptions as unknown as ReturnType<typeof vi.fn>
const verifyReg = verifyRegistrationResponse as unknown as ReturnType<typeof vi.fn>
const genAuthOpts = generateAuthenticationOptions as unknown as ReturnType<typeof vi.fn>
const verifyAuth = verifyAuthenticationResponse as unknown as ReturnType<typeof vi.fn>

const BASE = 'http://localhost:3000/api/orpc'
const CSRF = 'csrf-token-de-teste-0123456789'

const AUTH_RESPONSE = {
  id: 'cred-ext-1',
  rawId: 'cred-ext-1',
  response: { clientDataJSON: 'cdj', authenticatorData: 'ad', signature: 'sig' },
  type: 'public-key' as const,
}

function authedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'u@example.com',
    name: 'Usuária',
    isActive: true,
    role: 'user',
    currentOrgId: 'org-1',
    onboardingCompleted: true,
    twoFactorEnabled: false,
    organizations: [
      { organizationId: 'org-1', role: 'owner', isActive: true, organization: { id: 'org-1' } },
    ],
    ...overrides,
  }
}

function dbCredential(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pk-1',
    credentialId: 'cred-ext-1',
    publicKey: Buffer.from('pubkey'),
    counter: BigInt(7),
    transports: ['internal'],
    name: 'Minha Passkey',
    ...overrides,
  }
}

function bearer(): string {
  const token = signAccessToken({
    userId: 'user-1',
    email: 'u@example.com',
    role: 'user',
    currentOrgId: 'org-1',
  } as Parameters<typeof signAccessToken>[0])
  return `Bearer ${token}`
}

function csrfHeaders(auth = true): Record<string, string> {
  return {
    ...(auth ? { authorization: bearer() } : {}),
    'content-type': 'application/json',
    'x-csrf-token': CSRF,
    cookie: `csrf_token=${CSRF}`,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.deviceSession.findMany.mockResolvedValue([])
  db.deviceSession.create.mockResolvedValue({})
  db.refreshToken.create.mockResolvedValue({ id: 'rt-1' })
  db.refreshToken.update.mockResolvedValue({})
})

describe('oRPC — registro de passkey', () => {
  it('options: gera challenge single-use com excludeCredentials', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.passkeyCredential.findMany.mockResolvedValue([dbCredential()])
    genRegOpts.mockResolvedValue({ challenge: 'chal-reg-1', rp: { id: 'localhost' } })
    db.passkeyChallenge.deleteMany.mockResolvedValue({})
    db.passkeyChallenge.create.mockResolvedValue({})

    const res = await POST(
      new Request(`${BASE}/auth/passkey/register/options`, {
        method: 'POST',
        headers: csrfHeaders(),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { challenge: string } }
    expect(body.data.challenge).toBe('chal-reg-1')

    const genArg = genRegOpts.mock.calls[0][0] as { excludeCredentials: Array<{ id: string }> }
    expect(genArg.excludeCredentials).toEqual([{ id: 'cred-ext-1', transports: ['internal'] }])
    // Single-use: apaga challenges antigos antes de criar o novo
    expect(db.passkeyChallenge.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', type: 'registration' },
    })
  })

  it('verify: salva a credencial, apaga o challenge e audita', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.passkeyChallenge.findFirst.mockResolvedValue({ id: 'ch-1', challenge: 'chal-reg-1' })
    verifyReg.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: 'cred-ext-9', publicKey: new Uint8Array([1, 2]), counter: 0, transports: ['internal'] },
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
        aaguid: 'aaguid-1',
      },
    })
    db.passkeyCredential.create.mockResolvedValue({ id: 'pk-9' })
    db.passkeyChallenge.delete.mockResolvedValue({})

    const res = await POST(
      new Request(`${BASE}/auth/passkey/register/verify`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({
          response: {
            id: 'cred-ext-9',
            rawId: 'cred-ext-9',
            response: { clientDataJSON: 'cdj', attestationObject: 'ao' },
            type: 'public-key',
          },
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { verified: true, credentialId: 'cred-ext-9' },
      error: null,
    })
    expect(db.passkeyChallenge.delete).toHaveBeenCalledWith({ where: { id: 'ch-1' } })
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'passkey.registered' }),
    })
  })

  it('delete: 404 para passkey de outro usuário', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.passkeyCredential.findFirst.mockResolvedValue(null)

    const res = await DELETE(
      new Request(`${BASE}/auth/passkey/pk-alheia`, {
        method: 'DELETE',
        headers: csrfHeaders(),
      }),
    )

    expect(res.status).toBe(404)
    expect(db.passkeyCredential.delete).not.toHaveBeenCalled()
  })
})

describe('oRPC — login com passkey (email explícito)', () => {
  it('options: anti-enumeração para user sem passkeys', async () => {
    db.user.findUnique.mockResolvedValue({ ...authedUser(), passkeyCredentials: [] })

    const res = await POST(
      new Request(`${BASE}/auth/passkey/login/options`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'u@example.com' }),
      }),
    )

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain(
      'Não foi possível completar a autenticação com passkey',
    )
  })

  it('verify: atualiza counter, apaga challenge e emite sessão com audit', async () => {
    db.user.findUnique.mockResolvedValue({
      ...authedUser(),
      passkeyCredentials: [dbCredential()],
    })
    db.passkeyChallenge.findFirst.mockResolvedValue({ id: 'ch-2', challenge: 'chal-auth-1' })
    verifyAuth.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 8 } })
    db.passkeyCredential.update.mockResolvedValue({})
    db.passkeyChallenge.delete.mockResolvedValue({})

    const res = await POST(
      new Request(`${BASE}/auth/passkey/login/verify`, {
        method: 'POST',
        headers: csrfHeaders(false),
        body: JSON.stringify({ email: 'u@example.com', response: AUTH_RESPONSE }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({ user: expect.objectContaining({ id: 'user-1' }) })

    expect(db.passkeyCredential.update).toHaveBeenCalledWith({
      where: { id: 'pk-1' },
      data: { counter: BigInt(8), lastUsedAt: expect.any(Date) },
    })
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(true)
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'user.login',
        metadata: expect.objectContaining({ method: 'passkey', passkeyId: 'pk-1' }),
      }),
    })
  })

  it('verify: usuário com 2FA recebe challenge — passkey é só o 1º fator', async () => {
    db.user.findUnique.mockResolvedValue({
      ...authedUser({ twoFactorEnabled: true }),
      passkeyCredentials: [dbCredential()],
    })
    db.passkeyChallenge.findFirst.mockResolvedValue({ id: 'ch-2', challenge: 'chal-auth-1' })
    verifyAuth.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 8 } })
    db.passkeyCredential.update.mockResolvedValue({})
    db.passkeyChallenge.delete.mockResolvedValue({})

    const res = await POST(
      new Request(`${BASE}/auth/passkey/login/verify`, {
        method: 'POST',
        headers: csrfHeaders(false),
        body: JSON.stringify({ email: 'u@example.com', response: AUTH_RESPONSE }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({ requiresTwoFactor: true, challengeId: expect.any(String) })
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(false)
  })
})

describe('oRPC — fluxo conditional (sem email)', () => {
  it('challenge: cria challenge anônimo e responde challengeId', async () => {
    genAuthOpts.mockResolvedValue({ challenge: 'chal-cond-1' })
    db.passkeyChallenge.create.mockResolvedValue({ id: 'ch-cond-1' })

    const res = await POST(
      new Request(`${BASE}/auth/passkey/login/challenge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({ challenge: 'chal-cond-1', challengeId: 'ch-cond-1' })
    expect(db.passkeyChallenge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: null, email: null, type: 'conditional' }),
    })
  })

  it('verify-conditional: passkey desconhecida responde 400', async () => {
    db.passkeyChallenge.findFirst.mockResolvedValue({ id: 'ch-cond-1', challenge: 'chal-cond-1' })
    db.passkeyCredential.findFirst.mockResolvedValue(null)

    const res = await POST(
      new Request(`${BASE}/auth/passkey/login/verify-conditional`, {
        method: 'POST',
        headers: csrfHeaders(false),
        body: JSON.stringify({ challengeId: 'ch-cond-1', response: AUTH_RESPONSE }),
      }),
    )

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('Passkey não reconhecida')
  })

  it('verify-conditional: identifica o user pela credencial e emite sessão', async () => {
    db.passkeyChallenge.findFirst.mockResolvedValue({ id: 'ch-cond-1', challenge: 'chal-cond-1' })
    db.passkeyCredential.findFirst.mockResolvedValue({
      ...dbCredential(),
      user: authedUser(),
    })
    verifyAuth.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 9 } })
    db.passkeyChallenge.delete.mockResolvedValue({})
    db.passkeyCredential.update.mockResolvedValue({})

    const res = await POST(
      new Request(`${BASE}/auth/passkey/login/verify-conditional`, {
        method: 'POST',
        headers: csrfHeaders(false),
        body: JSON.stringify({ challengeId: 'ch-cond-1', response: AUTH_RESPONSE }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({ user: expect.objectContaining({ id: 'user-1' }) })
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(true)
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ method: 'passkey-conditional' }),
      }),
    })
  })
})
