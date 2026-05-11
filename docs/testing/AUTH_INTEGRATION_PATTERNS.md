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

## `withCommittedSeed` vs `withTransaction`

`withTransaction` is great when the test owns the prisma client it writes
through — the test passes `tx` directly into a repository call. But auth
controllers (and most Igniter handlers) use the **global** `prisma` client,
which lives in a different connection than `tx`. Rows seeded inside
`withTransaction` are invisible to those handlers until the (always rolled
back) transaction commits. The success branch of the controller therefore
returns `404 / invalid code`, and tests can only assert response shape.

`withCommittedSeed(seedFn, testFn, cleanupFn)` solves this by writing the
seed with the global `testPrisma` client (no transaction) so the handler
under test can see the rows. Cleanup runs in a `finally` block, so even a
failed assertion still resets the DB.

| Situation                                                              | Use                  |
|------------------------------------------------------------------------|----------------------|
| Test calls a repository directly and threads `tx` through              | `withTransaction`    |
| Test invokes an Igniter action whose handler uses the global `prisma`  | `withCommittedSeed`  |
| Test only needs to assert response shape on the **error** branch       | `withTransaction`    |
| Test needs to assert DB state after the handler ran                    | `withCommittedSeed`  |

```typescript
import { withCommittedSeed, testPrisma } from '@/../test/api/db';

it('returns the seeded user from /auth/me', async () => {
  await withCommittedSeed(
    async () => {
      const user = await testPrisma.user.create({
        data: { email: 'visible@test.local', name: 'Visible' },
      });
      return { userId: user.id };
    },
    async ({ userId }) => {
      const res = await callAction('GET /api/v1/auth/me', { /* headers */ });
      expect(res.data.user.id).toBe(userId);
    },
    async ({ userId }) => {
      await testPrisma.user.delete({ where: { id: userId } });
    },
  );
});
```

The trade-off is speed: `withCommittedSeed` runs explicit `DELETE`s instead
of a free rollback, so prefer `withTransaction` whenever the code-under-test
can accept a `tx` parameter.

## Mocking Igniter client in React tests

React component tests live under `test/unit/react/**/*.test.tsx` and run in
the `react` Vitest project (happy-dom). Auth components import the typed
client as `import { api } from '@/igniter.client'` — that module is
auto-generated and should never be edited, so tests stub it via `vi.mock`.

Always declare the mock at the top of the file (hoisted by Vitest) and
**before** importing the component under test:

```typescript
import { vi } from 'vitest'

const verifyLoginOTPMutate = vi.fn()

vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      verifyLoginOTP: { mutate: (...args: unknown[]) => verifyLoginOTPMutate(...args) },
      // add only the actions the component actually calls
    },
  },
}))

import { LoginOTPForm } from '@/client/components/auth/login-otp-form'
```

The shape must match the dotted path the component uses (`api.auth.X.mutate`
or `api.X.Y.useQuery`). Look it up in the component source — do not guess.
Reset between tests with `beforeEach(() => vi.clearAllMocks())`.

For components that call `fetch` directly (e.g. `TwoFactorChallenge` hits
`/api/v1/auth/totp-challenge`), stub `globalThis.fetch` instead:

```typescript
const fetchSpy = vi.fn()
beforeEach(() => {
  fetchSpy = vi.fn()
  globalThis.fetch = fetchSpy as unknown as typeof fetch
})
```

## Mocking Next.js navigation

Any component that imports from `next/navigation` (`useRouter`,
`useSearchParams`, `usePathname`) needs a hoisted mock or the hook will throw
outside the App Router runtime:

```typescript
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/',
}))
```

`next/link` does **not** need a mock — it works fine in happy-dom.

## Mocking Cloudflare Turnstile

`SignupOTPForm` renders `<TurnstileWidget />` which loads the Cloudflare
challenge script. Stub it with a no-op that issues a fake token so the form
becomes interactive:

```typescript
vi.mock('@/client/components/auth/turnstile-widget', () => ({
  TurnstileWidget: ({ onSuccess }: { onSuccess: (token: string) => void }) => {
    setTimeout(() => onSuccess('test-token'), 0)
    return null
  },
}))
```

## Mocking the CSRF helper

`LoginOTPForm` imports `getCsrfHeaders` from `@/client/hooks/use-csrf-token`.
That hook reads from a `<meta>` tag that does not exist in happy-dom. Stub it:

```typescript
vi.mock('@/client/hooks/use-csrf-token', () => ({
  getCsrfHeaders: () => ({ 'x-csrf-token': 'test-token' }),
  useCsrfToken: () => ({ token: 'test-token', isLoading: false }),
}))
```
