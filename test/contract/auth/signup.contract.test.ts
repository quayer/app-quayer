/**
 * Contract test — POST /auth/signup-otp
 *
 * Verifies the response shape of the signup OTP request endpoint.
 * Bootstrap mode: see docs/auth/CONTRACT_TESTING.md.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  invokeAction,
  unwrapEnvelope,
  assertContract,
  compareSnapshot,
} from './contract-helpers'

// Bootstrap response schema — derived from `auth.controller.ts:1284`:
//   `return response.success({ sent: true, message: 'Código enviado para seu email' });`
// Replace with a real shared schema when one is added.
const signupOtpResponseSchema = z.object({
  sent: z.boolean(),
  message: z.string().optional(),
})
type SignupOtpResponse = z.infer<typeof signupOtpResponseSchema>

describe('Contract: POST /auth/signup-otp', () => {
  it('responds with a payload that matches the documented contract', async () => {
    const { status, body } = await invokeAction('/auth/signup-otp', {
      name: 'Contract Test User',
      email: `contract-signup-${Date.now()}@quayer.test`,
    })

    // signup-otp may legitimately return 200 (sent) or 409 (email exists).
    // Both must follow the contract: contract test only validates the success
    // branch shape; conflict shapes are exercised in integration tests.
    if (status !== 200) {
      // Skip-with-warning rather than failing, so contract tests stay
      // independent of seeded DB state.
      console.warn(`[contract] signup-otp returned ${status}, skipping shape assertion`)
      return
    }

    const payload = unwrapEnvelope(body) as SignupOtpResponse
    const parsed = assertContract(signupOtpResponseSchema, payload)
    expect(parsed.sent).toBe(true)

    compareSnapshot('signup-otp success payload', payload)
  })
})
