# Auth Test Coverage (US-104 baseline)

This document tracks unit-test coverage for the passwordless auth surface.

## How coverage is measured

```
npx vitest run --coverage test/unit
```

The root `vitest.config.ts` declares two projects (`node`, `react`) and
v8 coverage. Coverage is opt-in (`coverage.enabled = false` by default)
so the `--coverage` flag is required.

## Status: v1 (baseline)

No minimum threshold is enforced yet. The actual percentage will be
captured the first time `npm install` + the command above are run on a
clean checkout. This file exists so the next agent can fill in the
numbers without re-discovering how to run the tooling.

## Files exercised by US-104

| Source under `src/`                                       | Test file                                  |
|-----------------------------------------------------------|--------------------------------------------|
| `src/lib/auth/bcrypt.ts` (`generateOTPCode`, recovery)    | `test/unit/auth/otp.test.ts`               |
| `src/lib/auth/jwt.ts` (sign/verify access/refresh/magic)  | `test/unit/auth/jwt.test.ts`               |
| `src/server/core/auth/procedures/auth.procedure.ts`       | `test/unit/auth/auth-procedure.test.ts`    |
| `src/server/core/auth/auth.schemas.ts` (passwordless)     | `test/unit/auth/zod-schemas.test.ts`       |

## Notes

- Quayer is 100% passwordless. There are no register/login-with-password
  schemas, no `forgotPassword`, no `resetPassword`. Coverage focuses on
  OTP, magic link, JWT, and the `authProcedure`.
- OTP verification is performed inline against the `VerificationCode`
  Prisma table inside the auth controller; there is no shared
  `verifyOtp()` helper to import. The OTP test mirrors the controller's
  TTL/used-flag contract locally.
- See `.claude/skills/testing-pipeline.md` for the broader pipeline
  context that this baseline plugs into.
