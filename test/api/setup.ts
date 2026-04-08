import { afterAll, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { testPrisma } from './db';

beforeAll(() => {
  // db-up.sh should have already run migrations; this is a safety net
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set');
  try {
    execSync(`DATABASE_URL="${url}" npx prisma migrate deploy`, { stdio: 'inherit' });
  } catch {
    // migrations may already be applied — tolerate
  }
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
