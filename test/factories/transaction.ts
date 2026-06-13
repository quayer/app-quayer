/**
 * withTransaction — runs the callback inside a Prisma transaction and
 * forces a rollback at the end. Used by C4 integration tests so each
 * test leaves the DB exactly as it was found.
 *
 * Why rollback instead of truncate?
 *   - Truncate is slow (especially with FK constraints) and blocks parallel
 *     test files.
 *   - A rollback is atomic and per-test, allowing fully parallel C4 runs
 *     even with shared schema.
 *
 * Usage:
 *
 *   import { withTransaction } from 'test/factories'
 *
 *   it('user CRUD inside a transaction', async () => {
 *     await withTransaction(async (tx) => {
 *       const u = await makeUser(tx)
 *       const found = await tx.user.findUnique({ where: { id: u.id } })
 *       expect(found).not.toBeNull()
 *       // Whatever happens here is rolled back when the callback returns.
 *     })
 *   })
 *
 * IMPORTANT: code under test that uses the singleton `prisma` client will
 * NOT see writes inside this transaction. To exercise such code, pass `tx`
 * as the client (the controllers in this repo already accept a client
 * argument, or you can dependency-inject via vi.mock).
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

class RollbackSignal extends Error {
  constructor() {
    super('TEST_ROLLBACK')
    this.name = 'RollbackSignal'
  }
}

let _client: PrismaClient | null = null

export function getTestPrisma(): PrismaClient {
  if (!_client) {
    const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
    if (!url) {
      throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set for integration tests')
    }
    _client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    })
  }
  return _client
}

export async function disconnectTestPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect()
    _client = null
  }
}

export async function withTransaction<T>(
  fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const prisma = getTestPrisma()
  const { timeoutMs = 10_000 } = options

  let result: T | undefined
  let captured: unknown

  try {
    await prisma.$transaction(
      async (tx) => {
        try {
          result = await fn(tx)
        } catch (err) {
          captured = err
        }
        throw new RollbackSignal()
      },
      { timeout: timeoutMs, maxWait: 5_000 },
    )
  } catch (err) {
    if (!(err instanceof RollbackSignal)) {
      throw err
    }
  }

  if (captured !== undefined) throw captured
  return result as T
}
