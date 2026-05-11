/**
 * 2FA factories — TotpDevice and RecoveryCode rows for J7 / J10-J12 tests.
 *
 * The TOTP `secret` field stores an ENCRYPTED secret (via src/lib/crypto).
 * Tests that need to GENERATE a valid TOTP code at runtime must decrypt
 * and pass the secret through `verifyTotpCode` (see auth.totp.helpers).
 *
 * For most assertion-only tests you just need the row to exist; pass
 * `verified: true` to mark it active.
 */

import type { Prisma, PrismaClient, TotpDevice, RecoveryCode, User } from '@prisma/client'

type TxOrClient = PrismaClient | Prisma.TransactionClient

let totpSeq = 0
const nextTotpSeq = () => ++totpSeq

export interface TotpDeviceOverrides {
  secret?: string
  name?: string
  verified?: boolean
}

/**
 * Creates a TotpDevice. By default the secret is a placeholder ciphertext —
 * any test that needs to validate a real TOTP code must override `secret`
 * with an actually-encrypted value (see `src/lib/crypto`).
 */
export async function makeTotpDevice(
  tx: TxOrClient,
  user: Pick<User, 'id'>,
  overrides: TotpDeviceOverrides = {},
): Promise<TotpDevice> {
  const n = nextTotpSeq()
  return tx.totpDevice.create({
    data: {
      userId: user.id,
      secret: overrides.secret ?? `encrypted-placeholder-${n}`,
      name: overrides.name ?? `Test Authenticator ${n}`,
      verified: overrides.verified ?? true,
    },
  })
}

export interface RecoveryCodeOverrides {
  /** Hashed code (bcrypt). Use src/lib/auth/bcrypt -> hashPassword to generate. */
  code?: string
  usedAt?: Date | null
}

/**
 * Creates a single RecoveryCode row. The `code` field stores a HASH; tests
 * that need to "redeem" the code must provide the hash AND keep the
 * plaintext to send in the request.
 */
export async function makeRecoveryCode(
  tx: TxOrClient,
  user: Pick<User, 'id'>,
  overrides: RecoveryCodeOverrides = {},
): Promise<RecoveryCode> {
  return tx.recoveryCode.create({
    data: {
      userId: user.id,
      code: overrides.code ?? `hashed-recovery-placeholder-${Date.now()}`,
      usedAt: overrides.usedAt ?? null,
    },
  })
}

/**
 * Creates a batch of `count` recovery codes for the given user. Returns
 * the rows; if you need the plaintext, pass `factory` that produces
 * { plaintext, hash } pairs.
 */
export async function makeRecoveryCodes(
  tx: TxOrClient,
  user: Pick<User, 'id'>,
  count = 8,
  factory?: (i: number) => { hash: string },
): Promise<RecoveryCode[]> {
  const rows: RecoveryCode[] = []
  for (let i = 0; i < count; i++) {
    rows.push(
      await makeRecoveryCode(tx, user, {
        code: factory ? factory(i).hash : `hashed-${i}-${Date.now()}`,
      }),
    )
  }
  return rows
}
