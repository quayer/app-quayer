/**
 * Quayer Builder — Shared constants
 *
 * Re-exports the Builder agent identity + defaults so other modules (runtime,
 * conversation controller, scripts) can import from a single stable path
 * without reaching into `./prompts/*`.
 *
 * Story: US-008 (Wave 2) — Quayer Builder PRD.
 */

/**
 * Reserved AIAgentConfig.name used to identify the Builder meta-agent within
 * an organization. Since `AIAgentConfig` has no `visibility` / `type` field
 * (see prisma/schema.prisma), the reserved name is the canonical marker:
 * it is unique per `(organizationId, name)` and will not collide with any
 * user-created agent because of the double-underscore sentinel prefix.
 *
 * Callers that list user-facing agents MUST filter rows where
 * `name === BUILDER_RESERVED_NAME` to keep the Builder hidden from the
 * regular agent catalog.
 */
export const BUILDER_RESERVED_NAME = '__quayer_builder__'

export { BUILDER_AGENT_DEFAULTS, BUILDER_SYSTEM_PROMPT } from './prompts/builder-system-prompt'
