import { PrismaClient } from '@prisma/client';

const TEST_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

export const testPrisma = new PrismaClient({
  datasources: { db: { url: TEST_URL } },
});

class RollbackSentinel extends Error {
  constructor() {
    super('__TEST_ROLLBACK__');
    this.name = 'RollbackSentinel';
  }
}

// Each test runs inside a prisma transaction that we ALWAYS roll back
// by throwing a sentinel at the end. Faster than truncate, safe for FKs.
export async function withTransaction<T>(
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>
): Promise<T> {
  let result: T | undefined;
  try {
    await testPrisma.$transaction(async (tx) => {
      result = await fn(tx);
      throw new RollbackSentinel();
    });
  } catch (err) {
    if (err instanceof RollbackSentinel) return result as T;
    throw err;
  }
  return result as T;
}

/**
 * Use this for integration tests where the HANDLER needs to SEE the seeded data.
 * Unlike withTransaction, seed runs committed — rows are visible to the controller
 * which uses the global prisma client. Cleanup runs in finally so state is reset.
 *
 * Trade-off: slightly slower than withTransaction because DELETE is explicit,
 * but the ONLY option when the code-under-test doesn't accept a tx parameter.
 *
 * Example:
 *   await withCommittedSeed(
 *     async () => {
 *       const user = await testPrisma.user.create({ data: { email: 'x@test.local' } });
 *       return { userId: user.id };
 *     },
 *     async ({ userId }) => {
 *       const response = await callAction('POST /api/v1/auth/me', { headers: ... });
 *       expect(response.data.user.id).toBe(userId);
 *     },
 *     async ({ userId }) => {
 *       await testPrisma.user.delete({ where: { id: userId } });
 *     },
 *   );
 */
export async function withCommittedSeed<TSeed, TResult>(
  seedFn: () => Promise<TSeed>,
  testFn: (seed: TSeed) => Promise<TResult>,
  cleanupFn: (seed: TSeed) => Promise<void>,
): Promise<TResult> {
  const seed = await seedFn();
  try {
    return await testFn(seed);
  } finally {
    try {
      await cleanupFn(seed);
    } catch (err) {
      console.error('[withCommittedSeed] cleanup failed:', err);
      // swallow — test result is more important than cleanup noise
    }
  }
}
