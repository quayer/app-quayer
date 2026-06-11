/**
 * Integration Builder — TEMPLATE descriptor schema (Wave 1, T05)
 *
 * An integration TEMPLATE is the reusable, leiga-facing blueprint the meta-agent
 * offers the user ("RD Station", "Webhook genérico"). Each template bundles:
 *   - a declarative `requestSpec` (T04) describing the HTTP call,
 *   - the `credentialFields` (T04) the user must supply (each with `whereToGet`
 *     step-by-step pt-BR instructions),
 *   - plain-language (leiga) pt-BR metadata (`displayName` / `description`),
 *   - a default snake_case `toolName` for the materialized AgentTool, and
 *   - a default natural-language `triggerDescription` ("quando o lead...").
 *
 * This module REUSES the closed validation surface from `../integration.schemas`
 * (T04) rather than redeclaring the request/credential shapes — the template is a
 * thin wrapper that adds leiga metadata + naming defaults around those primitives.
 *
 * VERSIONING (spec §9, decision 4): templates are versioned IN CODE, not in the
 * DB. The concrete template instances (RD Station, generic webhook — T13) live in
 * sibling files in this `templates/` folder; the registry imports them and
 * validates each against `integrationTemplateSchema` at module load, so a
 * malformed/typo'd template fails fast at import time instead of at runtime.
 *
 * Zero `any`. Dependency-free beyond `zod` + the T04 schemas. No DB, no IO.
 */

import { z } from 'zod'

import {
  credentialFieldsSchema,
  requestSpecSchema,
} from '../integration.schemas'

/**
 * A reusable integration template descriptor.
 *
 * CLOSED (`.strict()`): unknown keys are rejected so a typo'd template instance
 * (T13) fails at registry load instead of silently dropping a field.
 */
export const integrationTemplateSchema = z
  .object({
    /** Stable machine slug, kebab-case. e.g. 'rd-station', 'generic-webhook'. */
    slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
    /** Leiga pt-BR label shown to the user. e.g. "RD Station". */
    displayName: z.string().min(1),
    /** Plain-language (leiga) pt-BR description of what the integration does. */
    description: z.string().min(1),
    /**
     * Default natural-language trigger describing WHEN the agent should fire the
     * tool. e.g. "quando o lead demonstrar interesse...". The user may override.
     */
    triggerDescription: z.string().min(1),
    /**
     * Default snake_case name for the materialized AgentTool.
     * e.g. 'enviar_lead_rd_station'.
     */
    toolName: z.string().regex(/^[a-z][a-z0-9_]*$/),
    /** Declarative HTTP call spec (reused from T04). */
    requestSpec: requestSpecSchema,
    /**
     * Credential fields the user fills to activate (reused from T04). Each field
     * carries pt-BR `whereToGet` step-by-step instructions.
     */
    credentialFields: credentialFieldsSchema,
  })
  .strict()

export type IntegrationTemplate = z.infer<typeof integrationTemplateSchema>
