/**
 * Integration Builder (W2, T50) — unit tests for the NEW card-submit payload
 * schemas: `integration_proposal` (confirm-only) + `integration_credentials`
 * (string→string `values` map). Both are registered in `CARD_PAYLOAD_SCHEMAS`
 * (so `CARD_KEYS`/the param enum recognize the route) and accepted by the WIDER
 * route gate `cardSubmitRouteBodySchema` — but dispatched OUTSIDE the entrypoint
 * union, like the T31 acks.
 *
 * Scope: PURE Zod contract behavior — no DB, no IO, no `any`. We exercise the
 * route body gate (`cardSubmitRouteBodySchema`) and the per-card schemas plus the
 * derived registry/key surface, and prove the discriminated union still resolves
 * a pre-existing card (`agent_approval`) with no regression from the new keys.
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/builder/cards/card-submit.schemas.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  cardSubmitRouteBodySchema,
  CARD_PAYLOAD_SCHEMAS,
  CARD_KEYS,
  integrationProposalPayloadSchema,
  integrationCredentialsPayloadSchema,
  type IntegrationProposalPayload,
  type IntegrationCredentialsPayload,
  type CardSubmitRouteBody,
} from './card-submit.schemas'

describe('card-submit schemas — Integration Builder (W2, T50)', () => {
  describe('cardSubmitRouteBodySchema — route gate accepts the new cards', () => {
    it('accepts integration_proposal with action: "confirm"', () => {
      const result = cardSubmitRouteBodySchema.safeParse({
        cardKey: 'integration_proposal',
        action: 'confirm',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.cardKey).toBe('integration_proposal')
      }
    })

    it('accepts integration_credentials with a string-record values', () => {
      const result = cardSubmitRouteBodySchema.safeParse({
        cardKey: 'integration_credentials',
        values: { api_key: 'x' },
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.cardKey).toBe('integration_credentials')
        if (result.data.cardKey === 'integration_credentials') {
          expect(result.data.values).toEqual({ api_key: 'x' })
        }
      }
    })

    it('accepts integration_credentials with multiple string values', () => {
      const result = cardSubmitRouteBodySchema.safeParse({
        cardKey: 'integration_credentials',
        values: { api_key: 'sk-123', account_sid: 'AC987', region: 'us-east-1' },
      })
      expect(result.success).toBe(true)
    })
  })

  describe('cardSubmitRouteBodySchema — rejects malformed payloads', () => {
    it('rejects integration_proposal whose action is not the literal "confirm"', () => {
      const result = cardSubmitRouteBodySchema.safeParse({
        cardKey: 'integration_proposal',
        action: 'reject',
      })
      expect(result.success).toBe(false)
    })

    it('rejects integration_credentials whose values is not a string-record', () => {
      const result = cardSubmitRouteBodySchema.safeParse({
        cardKey: 'integration_credentials',
        values: { x: 123 },
      })
      expect(result.success).toBe(false)
    })

    it('rejects integration_credentials missing values entirely', () => {
      const result = cardSubmitRouteBodySchema.safeParse({
        cardKey: 'integration_credentials',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('per-card schemas in isolation', () => {
    it('integration_proposal: confirm ok, anything else fails', () => {
      expect(
        integrationProposalPayloadSchema.safeParse({
          cardKey: 'integration_proposal',
          action: 'confirm',
        }).success,
      ).toBe(true)
      expect(
        integrationProposalPayloadSchema.safeParse({
          cardKey: 'integration_proposal',
          action: 'cancel',
        }).success,
      ).toBe(false)
      // Wrong discriminator value is also rejected by the standalone schema.
      expect(
        integrationProposalPayloadSchema.safeParse({
          cardKey: 'agent_approval',
          action: 'confirm',
        }).success,
      ).toBe(false)
    })

    it('integration_credentials: empty string values are still strings (accepted)', () => {
      // The schema only constrains the SHAPE (string→string); non-empty is a
      // server-side concern, not part of this contract.
      const result = integrationCredentialsPayloadSchema.safeParse({
        cardKey: 'integration_credentials',
        values: { api_key: '' },
      })
      expect(result.success).toBe(true)
    })

    it('integration_credentials: a non-object values is rejected', () => {
      expect(
        integrationCredentialsPayloadSchema.safeParse({
          cardKey: 'integration_credentials',
          values: 'not-a-record',
        }).success,
      ).toBe(false)
      expect(
        integrationCredentialsPayloadSchema.safeParse({
          cardKey: 'integration_credentials',
          values: ['a', 'b'],
        }).success,
      ).toBe(false)
    })
  })

  describe('registry + derived key surface', () => {
    it('CARD_PAYLOAD_SCHEMAS includes both new keys', () => {
      expect(CARD_PAYLOAD_SCHEMAS).toHaveProperty('integration_proposal')
      expect(CARD_PAYLOAD_SCHEMAS).toHaveProperty('integration_credentials')
      // The registry entries are the same schema objects exported individually.
      expect(CARD_PAYLOAD_SCHEMAS.integration_proposal).toBe(
        integrationProposalPayloadSchema,
      )
      expect(CARD_PAYLOAD_SCHEMAS.integration_credentials).toBe(
        integrationCredentialsPayloadSchema,
      )
    })

    it('CARD_KEYS (derived from the registry) contains both new keys', () => {
      expect(CARD_KEYS).toContain('integration_proposal')
      expect(CARD_KEYS).toContain('integration_credentials')
    })
  })

  describe('discriminated union — no regression from the new keys', () => {
    it('resolves a pre-existing card (agent_approval) to its variant', () => {
      const result = cardSubmitRouteBodySchema.safeParse({
        cardKey: 'agent_approval',
        action: 'confirm',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.cardKey).toBe('agent_approval')
      }
    })

    it('still rejects an unknown cardKey (discriminator gate intact)', () => {
      const result = cardSubmitRouteBodySchema.safeParse({
        cardKey: 'definitely_not_a_card',
        action: 'confirm',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('inferred types are usable (compile-time, zero any)', () => {
    it('IntegrationProposalPayload / IntegrationCredentialsPayload type-check', () => {
      const proposal: IntegrationProposalPayload = {
        cardKey: 'integration_proposal',
        action: 'confirm',
      }
      const credentials: IntegrationCredentialsPayload = {
        cardKey: 'integration_credentials',
        values: { api_key: 'x' },
      }
      const asRouteBody: CardSubmitRouteBody = proposal
      expect(proposal.action).toBe('confirm')
      expect(credentials.values.api_key).toBe('x')
      expect(asRouteBody.cardKey).toBe('integration_proposal')
    })
  })
})
