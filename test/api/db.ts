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
