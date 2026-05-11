/**
 * Passkey factories — PasskeyCredential and PasskeyChallenge rows for
 * J15 (passkey registration) and J16 (passkey conditional/explicit login).
 *
 * IMPORTANT: J16 is LIVE in homol — `POST /api/v1/auth/passkey/login/challenge`
 * fires automatically when /login mounts. Tests must cover the happy path
 * and the failure mode where the endpoint returns 5xx.
 *
 * `publicKey` is a Bytes column storing the COSE-encoded public key. For
 * most happy-path tests a zero-filled 65-byte buffer is sufficient since
 * the assertion verification is mocked at the @simplewebauthn boundary.
 */

import type {
  Prisma,
  PrismaClient,
  PasskeyCredential,
  PasskeyChallenge,
  User,
} from '@prisma/client'

type TxOrClient = PrismaClient | Prisma.TransactionClient

let credSeq = 0
const nextCredSeq = () => ++credSeq

export interface PasskeyCredentialOverrides {
  credentialId?: string
  publicKey?: Buffer
  counter?: bigint
  credentialDeviceType?: 'singleDevice' | 'multiDevice'
  credentialBackedUp?: boolean
  transports?: string[]
  name?: string
  aaguid?: string | null
  lastUsedAt?: Date | null
}

const DEFAULT_PUBLIC_KEY = Buffer.alloc(65, 0)

export async function makePasskeyCredential(
  tx: TxOrClient,
  user: Pick<User, 'id'>,
  overrides: PasskeyCredentialOverrides = {},
): Promise<PasskeyCredential> {
  const n = nextCredSeq()
  return tx.passkeyCredential.create({
    data: {
      userId: user.id,
      credentialId: overrides.credentialId ?? `mock-credential-${n}-${Date.now()}`,
      publicKey: overrides.publicKey ?? DEFAULT_PUBLIC_KEY,
      counter: overrides.counter ?? BigInt(0),
      credentialDeviceType: overrides.credentialDeviceType ?? 'singleDevice',
      credentialBackedUp: overrides.credentialBackedUp ?? false,
      transports: overrides.transports ?? ['internal'],
      name: overrides.name ?? `Test Passkey ${n}`,
      aaguid: overrides.aaguid ?? null,
      lastUsedAt: overrides.lastUsedAt ?? null,
    },
  })
}

export interface PasskeyChallengeOverrides {
  challenge?: string
  userId?: string | null
  email?: string | null
  type?: 'registration' | 'authentication' | 'conditional'
  expiresAt?: Date
}

/**
 * Creates a PasskeyChallenge row. Default expires in 5 minutes (mirrors
 * production WebAuthn challenge TTL).
 */
export async function makePasskeyChallenge(
  tx: TxOrClient,
  overrides: PasskeyChallengeOverrides = {},
): Promise<PasskeyChallenge> {
  return tx.passkeyChallenge.create({
    data: {
      challenge: overrides.challenge ?? `mock-challenge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: overrides.userId ?? null,
      email: overrides.email ?? null,
      type: overrides.type ?? 'authentication',
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000),
    },
  })
}
