/**
 * Contract test — POST /auth/verify-login-otp
 *
 * Verifies the SHAPE of the verify-OTP response. Because we cannot reach the
 * "success" branch without first generating a real OTP code (which would
 * require DB seeding and overlap with US-106B integration tests), this
 * contract test asserts the ERROR envelope shape — which is just as much a
 * frontend contract as the success path. The frontend uses the same envelope
 * structure to render the "código inválido" UI.
 *
 * US-108 upgrade: the SUCCESS schema is now imported from
 * `@/server/core/auth/auth.schemas` (`otpVerifyResponseSchema`) so any
 * future success-branch tests can `.parse()` against the real contract. The
 * error-envelope schema below remains local because Igniter error wrapping
 * is independent of the auth feature.
 *
 * See docs/auth/CONTRACT_TESTING.md.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  invokeAction,
  assertContract,
  compareSnapshot,
} from './contract-helpers'
import { otpVerifyResponseSchema as importedSuccessSchema } from '@/server/core/auth/auth.schemas'

// FALLBACK success schema — only used if the import above ever resolves to
// undefined. Keep in sync with auth.schemas.ts.
const fallbackSuccessSchema = z.object({
  needsOnboarding: z.boolean(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().nullable(),
    role: z.string(),
    currentOrgId: z.string().nullable(),
    organizationRole: z.string().optional(),
  }),
})

// Exported for any future success-branch tests that seed a real OTP code.
export const otpVerifySuccessSchema = importedSuccessSchema ?? fallbackSuccessSchema

// Igniter wraps errors as `{ error: { code, message } }` (or similar). We
// accept either an `error` key or the success envelope, since both must
// remain stable.
const otpVerifyErrorSchema = z.object({
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .passthrough()
    .optional(),
  data: z.unknown().optional(),
})
type OtpVerifyErrorResponse = z.infer<typeof otpVerifyErrorSchema>

describe('Contract: POST /auth/verify-login-otp', () => {
  it('returns a stable error-envelope shape for an invalid code', async () => {
    const { status, body } = await invokeAction('/auth/verify-login-otp', {
      email: `contract-test-${Date.now()}@quayer.test`,
      code: '000000',
      rememberMe: false,
    })

    // Either 400 (invalid code), 401 (unauthorised) or 422 (validation) —
    // all are valid contract states for the frontend.
    expect([400, 401, 403, 404, 422]).toContain(status)

    const parsed = assertContract<OtpVerifyErrorResponse>(otpVerifyErrorSchema, body)
    // Sanity: at least one of the documented top-level keys must be present.
    expect(parsed.error || parsed.data).toBeDefined()

    compareSnapshot('verify-login-otp error payload', body)
  })
})
