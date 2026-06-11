/**
 * Integration Builder — template registry tests (Wave 1, T46)
 *
 * Pins the registry contract (`./index.ts`) from the consumer's side:
 *
 *   1. Every template `listIntegrationTemplates()` returns is a valid
 *      `IntegrationTemplate` (runtime parse, not just compile-time type).
 *   2. `getIntegrationTemplate(slug)` resolves the right concrete template by
 *      its `toolName` and returns `null` for an unknown slug.
 *   3. RD Station's `requestSpec.testPayload` carries the "TESTE Quayer" marker
 *      so the validation test call is clearly identifiable as a Quayer probe.
 *   4. Every template exposes at least one credential field with a non-empty
 *      pt-BR `whereToGet` step-by-step (leiga onboarding requirement).
 *   5. Slugs are unique and `INTEGRATION_TEMPLATES` is keyed by `slug`.
 *
 * Tests only — never mutate the templates. Zero `any`.
 */

import { describe, it, expect } from 'vitest'

import {
  INTEGRATION_TEMPLATES,
  getIntegrationTemplate,
  listIntegrationTemplates,
} from './index'
import { integrationTemplateSchema } from './integration-template.types'

describe('integration template registry', () => {
  describe('schema validity', () => {
    it('returns a non-empty list', () => {
      expect(listIntegrationTemplates().length).toBeGreaterThan(0)
    })

    it('every listed template passes integrationTemplateSchema.safeParse', () => {
      for (const template of listIntegrationTemplates()) {
        const result = integrationTemplateSchema.safeParse(template)
        // Surface the offending slug + zod issues if a template is malformed.
        expect(
          result.success,
          `template "${template.slug}" failed schema: ${
            result.success ? '' : JSON.stringify(result.error.issues)
          }`,
        ).toBe(true)
      }
    })
  })

  describe('getIntegrationTemplate', () => {
    it('resolves the RD Station template with toolName enviar_lead_rd_station', () => {
      const template = getIntegrationTemplate('rd-station')
      expect(template).not.toBeNull()
      expect(template?.slug).toBe('rd-station')
      expect(template?.toolName).toBe('enviar_lead_rd_station')
    })

    it('resolves the generic webhook template with toolName enviar_para_webhook', () => {
      const template = getIntegrationTemplate('generic-webhook')
      expect(template).not.toBeNull()
      expect(template?.slug).toBe('generic-webhook')
      expect(template?.toolName).toBe('enviar_para_webhook')
    })

    it('returns null for an unknown slug', () => {
      expect(getIntegrationTemplate('nonexistent')).toBeNull()
    })
  })

  describe('RD Station testPayload marker', () => {
    it('marks the test payload as a Quayer probe ("TESTE" + "Quayer")', () => {
      const template = getIntegrationTemplate('rd-station')
      expect(template).not.toBeNull()

      const testPayload = template?.requestSpec.testPayload
      expect(testPayload).toBeDefined()

      // The `nome` field carries the leiga-facing marker so the lead created in
      // RD Station during the validation call is obviously ignorable test data.
      const nome = testPayload?.nome
      expect(typeof nome).toBe('string')
      expect(nome as string).toContain('TESTE')
      expect(nome as string).toContain('Quayer')
    })
  })

  describe('credentialFields onboarding instructions', () => {
    it('every template has at least one credential field with a non-empty whereToGet', () => {
      for (const template of listIntegrationTemplates()) {
        expect(
          template.credentialFields.length,
          `template "${template.slug}" has no credential fields`,
        ).toBeGreaterThan(0)

        const withInstructions = template.credentialFields.filter(
          (field) => field.whereToGet.trim().length > 0,
        )
        expect(
          withInstructions.length,
          `template "${template.slug}" has no credential field with whereToGet instructions`,
        ).toBeGreaterThan(0)
      }
    })
  })

  describe('slug uniqueness + registry keying', () => {
    it('all slugs are unique', () => {
      const slugs = listIntegrationTemplates().map((t) => t.slug)
      expect(new Set(slugs).size).toBe(slugs.length)
    })

    it('INTEGRATION_TEMPLATES is keyed by each template slug', () => {
      for (const template of listIntegrationTemplates()) {
        expect(INTEGRATION_TEMPLATES[template.slug]).toBe(template)
      }
    })

    it('INTEGRATION_TEMPLATES has exactly one key per listed template', () => {
      expect(Object.keys(INTEGRATION_TEMPLATES).length).toBe(
        listIntegrationTemplates().length,
      )
    })
  })
})
