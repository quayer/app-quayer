/**
 * Contract test — POST /auth/login-otp (passwordless OTP request)
 *
 * Bootstrap mode: the auth feature ships REQUEST schemas only
 * (`passwordlessOTPSchema`), not RESPONSE schemas. We therefore validate the
 * shape via snapshot. The first test run records the canonical shape; future
 * runs fail loudly if the backend mutates it.
 *
 * See docs/auth/CONTRACT_TESTING.md for the full pattern.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  invokeAction,
  unwrapEnvelope,
  assertContract,
  compareSnapshot,
} from './contract-helpers'

// Bootstrap response schema — derived from the controller's success payload
// at `auth.controller.ts:1570` (`return response.success({ sent: true, ... })`).
// When/if a real shared response schema lands in `src/server/core/auth/auth.schemas.ts`,
// import it here instead and delete this local declaration.
const otpRequestResponseSchema = z.object({
  sent: z.boolean(),
})
type OtpRequestResponse = z.infer<typeof otpRequestResponseSchema>

describe('Contract: POST /auth/login-otp', () => {
  it('responds with a payload that matches the documented contract', async () => {
    const { status, body } = await invokeAction('/auth/login-otp', {
      // Use a syntactically valid email so we get past Zod validation
      // and reach the success branch. The endpoint is intentionally
      // non-revealing for unknown emails.
      email: `contract-test-${Date.now()}@quayer.test`,
      rememberMe: false,
    })

    // The endpoint is non-revealing: known + unknown emails both yield 200.
    expect(status).toBe(200)

    const payload = unwrapEnvelope(body) as OtpRequestResponse
    const parsed = assertContract(otpRequestResponseSchema, payload)

    expect(typeof parsed.sent).toBe('boolean')

    compareSnapshot('login-otp success payload', payload)
  })
})
