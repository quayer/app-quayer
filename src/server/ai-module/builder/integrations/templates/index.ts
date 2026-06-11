/**
 * Integration Builder — template registry (Wave 1, T13)
 *
 * Typed, code-versioned registry of the available integration templates (spec
 * §9, decision 4: templates live in code, not the DB). Each concrete template is
 * imported and validated against `integrationTemplateSchema` at MODULE LOAD, so a
 * malformed/typo'd template instance fails fast at import time instead of at
 * runtime when a user tries to activate it.
 *
 * Lookups go through `getIntegrationTemplate(slug)` (null when unknown) and
 * `listIntegrationTemplates()` (the meta-agent's offer list). Zero `any`, no IO.
 */

import {
  integrationTemplateSchema,
  type IntegrationTemplate,
} from './integration-template.types'
import { genericWebhookTemplate } from './generic-webhook.template'
import { rdStationTemplate } from './rd-station.template'

/** All templates, in offer order. */
const ALL: readonly IntegrationTemplate[] = [rdStationTemplate, genericWebhookTemplate]

// Fail fast at module load: a malformed template throws here, not at runtime.
for (const template of ALL) {
  integrationTemplateSchema.parse(template)
}

/** Slug → template lookup map. */
export const INTEGRATION_TEMPLATES: Record<string, IntegrationTemplate> =
  Object.fromEntries(ALL.map((t) => [t.slug, t]))

/** Returns the template for `slug`, or `null` when no such template exists. */
export function getIntegrationTemplate(slug: string): IntegrationTemplate | null {
  return INTEGRATION_TEMPLATES[slug] ?? null
}

/** Returns every available template (offer order). */
export function listIntegrationTemplates(): readonly IntegrationTemplate[] {
  return ALL
}
