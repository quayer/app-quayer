# Contract Testing — Auth API

Story: **US-108** of the Quayer Testing Pipeline PRD.

## Why contract tests?

Contract tests catch breaking response-shape changes BEFORE the frontend
breaks in production. They sit between unit tests (no I/O) and integration
tests (full behaviour). Their single job is to answer one question:

> "If I deploy this backend change, will the existing frontend still parse
> the response without crashing?"

A contract test is intentionally **shape-only**:

- It does NOT check rate limits, DB side effects, JWT contents, or business
  logic. Those belong in `test/api/**` (US-106B).
- It does NOT mock the network. It calls the running dev server over HTTP,
  the same way the frontend does.
- It does NOT seed data. Tests must run against any DB state (we use
  non-revealing endpoints + synthetic emails).

## How a contract test works

Each test does three things:

1. **Calls the endpoint** via `invokeAction()` from `contract-helpers.ts`
   (a thin `fetch()` wrapper around `BASE_URL` + `/api/v1`).
2. **Validates the response against a Zod schema** via `assertContract()`.
   The schema MUST be the same one the frontend uses to parse this endpoint.
   Re-declaring a schema defeats the entire test — you would just be
   asserting that the test agrees with itself.
3. **Snapshots the shape** via `compareSnapshot()`. This catches NEW fields
   the schema doesn't yet know about (additive changes are non-breaking but
   still deserve a manual review).

## Bootstrap mode

As of 2026-04-08 the auth feature ships REQUEST schemas only
(`src/server/core/auth/auth.schemas.ts`). There are no shared response
schemas the frontend imports — the response shape is implicit in the
controller's `response.success({...})` calls.

When that is the case, contract tests run in **bootstrap mode**:

- We declare a small local Zod schema inside the contract test that mirrors
  the controller's success payload.
- We rely primarily on `compareSnapshot()` to lock the shape. The first run
  records the canonical snapshot; future drift fails the test loudly.
- A `// TODO` comment marks the local schema. When the codebase grows real
  shared response schemas, replace the local declaration with an import and
  delete the bootstrap copy. The test body does not change.

This is a deliberate, documented compromise. The alternative — writing no
contract tests until response schemas exist — would leave the frontend
defenceless against the most common kind of breakage.

## Running

```bash
# Start the dev server in another terminal
npm run dev

# Run contract tests against it
npx vitest --config vitest.config.contract.ts
```

`API_BASE_URL` overrides the default `http://localhost:3000/api/v1`.

## When a contract test fails

There are exactly two outcomes:

1. **The change was unintentional.** Revert or fix the backend.
2. **The change was intentional** (you really did add/rename/remove a field).
   Then:
   - Update any frontend callers that depend on the old shape.
   - If a real Zod response schema exists, update it.
   - Re-record the snapshot:
     ```bash
     npx vitest --config vitest.config.contract.ts -u
     ```
   - Review the diff in the `__snapshots__/` file as part of the PR.

## Rules

- **NEVER edit a snapshot file by hand.** Always regenerate with `-u`.
- **NEVER duplicate a Zod schema** to make a test pass. Import the real one.
  If none exists, document it as bootstrap mode (see above).
- **NEVER add behavioural assertions** to contract tests (no DB checks, no
  rate-limit assertions, no auth scope checks). Use `test/api/**` for that.
- **Contract tests must be deterministic** — no random emails that could
  collide, no time-of-day branches, no sleeps. Use `Date.now()` suffixes.
- Zero `any`. Use `z.infer<typeof schema>` for typed payloads.

## Files

- `test/contract/auth/contract-helpers.ts` — invokeAction, assertContract,
  compareSnapshot, describeShape, unwrapEnvelope
- `test/contract/auth/otp-request.contract.test.ts` — POST `/auth/login-otp`
- `test/contract/auth/otp-verify.contract.test.ts` — POST `/auth/verify-login-otp`
- `test/contract/auth/signup.contract.test.ts` — POST `/auth/signup-otp`
- `vitest.config.contract.ts` — vitest project config for the contract layer

## See also

- `.claude/skills/testing-pipeline.md`
- `docs/auth/TESTING_PATTERNS.md`
- `test/api/auth.test.ts` (US-106B integration tests, behaviour-focused)
