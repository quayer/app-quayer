/**
 * User factory — produces deterministic-but-unique User rows for tests.
 *
 * Usage:
 *
 *   import { makeUser, makeUserWith2FA, withTransaction } from 'test/factories'
 *
 *   await withTransaction(async (tx) => {
 *     const u = await makeUser(tx, { email: 'custom@test.local' })
 *     // ... assertions ...
 *   })
 *
 * Conventions:
 *   - Emails default to `*@test.local` so production filters can exclude them.
 *   - Every factory accepts an overrides object — pass only what your test cares
 *     about; everything else gets safe defaults.
 *   - Factories never `await prisma.$disconnect()`. The caller owns the tx.
 *
 * Why not use a generator like faker?
 *   - Determinism. Tests should produce the same User in the same order so
 *     debug logs can be diffed.
 *   - Zero dependency. faker is heavy and tempts non-deterministic seeds.
 */

import type { Prisma, PrismaClient, User } from '@prisma/client'

type TxOrClient = PrismaClient | Prisma.TransactionClient

let seq = 0
const nextSeq = () => ++seq

export interface UserOverrides {
  email?: string
  name?: string
  password?: string | null
  emailVerified?: Date | null
  phone?: string | null
  phoneVerified?: boolean
  role?: 'admin' | 'user'
  twoFactorEnabled?: boolean
  onboardingCompleted?: boolean
  isActive?: boolean
  currentOrgId?: string | null
  language?: string | null
  timezone?: string | null
}

const DEFAULT_PASSWORD_HASH =
  '$2a$10$testtesttesttesttesttuQpQpQpQpQpQpQpQpQpQpQpQpQpQpQ'

/**
 * Creates a "vanilla" verified user, no 2FA, default org-less, no password
 * (Quayer is passwordless by default — pass `password: <hash>` if needed).
 */
export async function makeUser(
  tx: TxOrClient,
  overrides: UserOverrides = {},
): Promise<User> {
  const n = nextSeq()
  return tx.user.create({
    data: {
      email: overrides.email ?? `user-${n}-${Date.now()}@test.local`,
      name: overrides.name ?? `Test User ${n}`,
      password: overrides.password ?? null,
      emailVerified: overrides.emailVerified ?? new Date(),
      phone: overrides.phone ?? null,
      phoneVerified: overrides.phoneVerified ?? false,
      role: overrides.role ?? 'user',
      twoFactorEnabled: overrides.twoFactorEnabled ?? false,
      onboardingCompleted: overrides.onboardingCompleted ?? true,
      isActive: overrides.isActive ?? true,
      currentOrgId: overrides.currentOrgId ?? null,
      language: overrides.language ?? 'pt-BR',
      timezone: overrides.timezone ?? 'America/Sao_Paulo',
    },
  })
}

/** Pending user (signup OTP not yet verified). */
export function makePendingUser(tx: TxOrClient, overrides: UserOverrides = {}): Promise<User> {
  return makeUser(tx, {
    ...overrides,
    emailVerified: null,
    onboardingCompleted: false,
    password: null,
  })
}

/** User with 2FA enabled (TOTP). Caller is responsible for creating TotpDevice rows. */
export function makeUserWith2FA(tx: TxOrClient, overrides: UserOverrides = {}): Promise<User> {
  return makeUser(tx, { ...overrides, twoFactorEnabled: true })
}

/** User with password set (legacy login flows). */
export function makeUserWithPassword(
  tx: TxOrClient,
  overrides: UserOverrides = {},
): Promise<User> {
  return makeUser(tx, { ...overrides, password: overrides.password ?? DEFAULT_PASSWORD_HASH })
}

/** Admin user (system-wide role, not org-scoped). */
export function makeAdminUser(tx: TxOrClient, overrides: UserOverrides = {}): Promise<User> {
  return makeUser(tx, { ...overrides, role: 'admin' })
}

/** User who completed phone verification (for WhatsApp OTP flows). */
export function makeUserWithPhone(
  tx: TxOrClient,
  overrides: UserOverrides = {},
): Promise<User> {
  return makeUser(tx, {
    ...overrides,
    phone: overrides.phone ?? `+5511${String(900000000 + nextSeq()).padStart(9, '0')}`,
    phoneVerified: overrides.phoneVerified ?? true,
  })
}
