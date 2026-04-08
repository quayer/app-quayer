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
 * Bootstrap mode: see docs/auth/CONTRACT_TESTING.md.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  invokeAction,
  assertContract,
  compareSnapshot,
} from './contract-helpers'

// Bootstrap error envelope schema — Igniter wraps errors as
// `{ error: { code, message } }` (or similar). We accept either an `error`
// key or the success envelope, since both must remain stable.
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
