/**
 * Contract test — POST /auth/login-otp (passwordless OTP request)
 *
 * US-108 upgrade: now imports the REAL response schema from
 * `@/server/core/auth/auth.schemas`. The schema mirrors what the controller
 * returns today, so any drift between backend and contract is caught at
 * `schema.parse()` time. The local fallback below is kept as a safety net in
 * case the import path resolves to nothing during a refactor.
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
import { otpRequestResponseSchema as importedSchema } from '@/server/core/auth/auth.schemas'

// FALLBACK schema — only used if the import above ever resolves to undefined
// (e.g. during a half-applied refactor). Keep in sync with auth.schemas.ts.
const fallbackSchema = z.object({
  sent: z.boolean(),
  message: z.string(),
  magicLinkSessionId: z.string(),
  isNewUser: z.boolean().optional(),
})

const otpRequestResponseSchema = importedSchema ?? fallbackSchema
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
    // Real-schema parse: throws if controller drifts from contract.
    expect(() => otpRequestResponseSchema.parse(payload)).not.toThrow()
    const parsed = assertContract(otpRequestResponseSchema, payload)

    expect(typeof parsed.sent).toBe('boolean')

    compareSnapshot('login-otp success payload', payload)
  })
})
