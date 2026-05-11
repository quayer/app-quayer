# Testing Setup — Vitest Unit Layer (US-102)

This document describes the unit-test foundation for Quayer. Other test layers
(API integration, E2E with Playwright, contract, DB) are owned by separate
stories and have their own configs.

## Running unit tests

```bash
# Run all unit tests once
npm run test:unit

# Watch mode (re-runs on file changes)
npm run test:unit:watch

# Typecheck only the test sources against tsconfig.test.json
npm run typecheck:test

# Opt-in coverage report
npm run test:unit -- --coverage
```

Coverage is intentionally NOT enabled by default. Add `--coverage` only when
you need it locally — CI may enable it via dedicated jobs.

## Where tests live

| Path | Purpose | Environment |
|---|---|---|
| `test/unit/**/*.test.ts` | Pure backend / lib / utility unit tests | `node` |
| `test/unit/react/**/*.test.tsx` | React component unit tests | `happy-dom` |
| `test/api/**` | API integration tests (other story) | n/a here |
| `test/e2e/**` | Playwright end-to-end (other story) | n/a here |

The environment is auto-selected by `environmentMatchGlobs` in
`vitest.config.ts`. You do NOT need to declare it inside the test file.

## Adding a new unit test

1. Create the file under `test/unit/` mirroring the source path. Examples:
   - Source: `src/lib/validators/email.ts`
     Test:   `test/unit/lib/validators/email.test.ts`
   - Source: `src/client/components/auth/login-form-final.tsx`
     Test:   `test/unit/react/client/components/auth/login-form-final.test.tsx`
2. Use the `*.test.ts` (or `*.test.tsx` for React) naming convention. The
   `include` glob in `vitest.config.ts` will not pick up `*.spec.ts` here.
3. Import test helpers explicitly — globals are disabled:

   ```ts
   import { describe, it, expect, vi, beforeEach } from 'vitest'
   ```

## Mocking the Igniter client

The Igniter auto-generated client (`src/igniter.client.ts`) MUST be mocked in
unit tests; it is not meant to execute against a real backend.

```ts
import { vi } from 'vitest'

vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      login: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
          isPending: false,
          error: null,
        })),
      },
    },
  },
}))
```

For server-side `query()` callers, mock the same module path and return
`{ data, error }` shaped objects matching the action you exercise.

## TypeScript for tests

`tsconfig.test.json` extends the root `tsconfig.json` and adds the `vitest`
ambient types so editors and `npm run typecheck:test` understand the test
files. Production typechecking already excludes `test/**/*.ts`, so test code
will never be compiled into the Next.js build.

## What this story does NOT cover

- GitHub Actions wiring (US-103)
- Playwright config (US-107A)
- compose.test.yml / DB seeds (US-106A)
- Authoring of actual unit tests under `test/unit/` (other stories)
