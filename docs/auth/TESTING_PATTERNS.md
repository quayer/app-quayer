# Auth Integration Testing Patterns (US-106A)

This document describes the conventions for writing auth integration tests
against the dedicated test postgres provided by `compose.test.yml`.

Related skill: `.claude/skills/testing-pipeline.md`

## Lifecycle

1. `scripts/test/db-up.sh` boots `quayer-test-postgres` on port 5433, runs
   `prisma migrate deploy`, then runs `prisma/seeds/test/auth-seed.ts`.
2. Vitest is run with `TEST_DATABASE_URL` exported by `db-up.sh`.
3. `scripts/test/db-down.sh` tears the container and its volume back down.

The test postgres is **isolated** from the dev database (port 5432) and from
homologation. Never point integration tests at a shared environment.

## Transaction rollback isolation

Every integration test should run inside `withTransaction(...)` from
`test/api/db.ts`. The helper opens a `$transaction`, hands the test a `tx`
client, and then unconditionally throws a `RollbackSentinel` so prisma rolls
the work back. The sentinel is caught and the original return value is
forwarded to the caller.

Why this beats `TRUNCATE` between tests:

- **Speed.** No DDL, no FK cascade walks, no reseed.
- **Foreign-key safety.** Truncate-based cleanup must list tables in the right
  order or use `RESTART IDENTITY CASCADE`, which is brittle as the schema
  grows.
- **Zero leakage.** The committed state at the end of every test is identical
  to the seeded baseline, so test ordering can never matter.
- **Parallel-friendly.** Each worker uses its own transaction; no cross-test
  contention on shared rows.

## Example usage

```typescript
import { withTransaction } from '@/../test/api/db';

it('creates a user', async () => {
  await withTransaction(async (tx) => {
    const u = await tx.user.create({ data: { email: 't@test.local', name: 'T' } });
    expect(u.email).toBe('t@test.local');
  });
  // row was rolled back — DB is clean for the next test
});
```

## Seed data

`prisma/seeds/test/auth-seed.ts` creates the bare minimum:

- **1 Organization** — `name: "Test Org"`, `slug: "test-org"`, `type: "pj"`.
- **1 confirmed user** — `confirmed@test.local`, `emailVerified` set, linked
  to Test Org as `master`.
- **1 pending user** — `pending@test.local`, `emailVerified: null`, no org
  membership (mirrors a user mid-signup).

The seed is `upsert`-based and idempotent. Anything beyond these three rows
should be created inside `withTransaction` so it never leaks across tests.

## When to use `withTransaction` vs the raw client

| Situation                                  | Use                          |
|--------------------------------------------|------------------------------|
| Any integration test that writes to the DB | `withTransaction(...)`       |
| Any integration test that only reads       | `withTransaction(...)`       |
| One-off setup inside `beforeAll`           | `testPrisma` (rare)          |
| Production / app code                      | The normal `prisma` instance |

**Rule of thumb:** if the code lives under `test/api/`, it goes through
`withTransaction`. The only legitimate use of the raw `testPrisma` client is
the vitest setup file, which needs to disconnect on teardown.
