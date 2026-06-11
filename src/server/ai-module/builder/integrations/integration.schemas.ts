/**
 * Integration Builder — closed Zod validation surface (Wave 1, T04)
 *
 * This is the FOUNDATION of the Integration Builder: the single, CLOSED
 * (`.strict()`) validation surface for declarative HTTP integrations the
 * meta-agent proposes and the user activates. Everything that crosses the API
 * boundary (route bodies, params) and everything persisted into a template's
 * `requestSpec`/`credentialFields` is validated HERE before it is trusted.
 *
 * SECURITY INVARIANTS (load-bearing — do not relax):
 *  - Credential VALUES never live in `builderState` and never echo back. The
 *    `updateCredentialsBodySchema` carries submitted secrets one-way (write
 *    only); reads return field metadata + a "filled?" flag, never the value.
 *  - A `requestSpec` describes a call DECLARATIVELY using placeholder tokens:
 *      `{{credentials.<key>}}`  — resolved from the stored secret store
 *      `{{params.<name>}}`      — resolved from the runtime/LLM-supplied params
 *    Placeholders are resolved ONLY inside the executor (`request-spec.ts`, T09),
 *    never at validation time. This schema treats them as opaque strings.
 *  - `url` is required to be a URL here; the executor MUST additionally enforce
 *    https + SSRF/host allow-listing at call time (the schema is the first gate,
 *    never the only one — mirrors the card-submit "re-validate server-side"
 *    pattern used across the builder module).
 *
 * Zero `any`. Dependency-free beyond `zod`. No DB, no IO.
 */

import { z } from 'zod'

// ==========================================
// requestSpec — declarative HTTP call spec
// ==========================================

/** HTTP verbs an integration may declare. */
export const requestMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
export type RequestMethod = z.infer<typeof requestMethodSchema>

/**
 * Where the secret is injected and which credential field supplies it.
 *
 * Modeled as a CLOSED object with a `type` enum + optional placement fields
 * (rather than a `z.discriminatedUnion`) on purpose: every variant shares the
 * same `credentialKey` leaf and only differs on WHICH optional placement field
 * matters, so a single strict object keeps the shape flat and lets the executor
 * branch on `type`. The executor RE-VALIDATES the per-type requirement
 * (`header` needs `headerName`, `query` needs `queryParam`) — this schema is the
 * first gate, not the only one.
 *
 * Conventions per `type`:
 *  - 'bearer' → Authorization: `Bearer {{credentials.<credentialKey>}}`
 *  - 'header' → custom header `headerName: {{credentials.<credentialKey>}}`
 *  - 'query'  → query param `queryParam={{credentials.<credentialKey>}}`
 *  - 'basic'  → HTTP Basic; `credentialKey` names the credential field holding
 *               the combined `user:pass` string, base64-encoded by the executor.
 */
export const requestAuthSchema = z
  .object({
    type: z.enum(['bearer', 'header', 'query', 'basic']),
    /** Required by the executor when `type === 'header'`. */
    headerName: z.string().optional(),
    /** Required by the executor when `type === 'query'`. */
    queryParam: z.string().optional(),
    /** Names the credential field (see `credentialFieldSchema.key`) that supplies the secret. */
    credentialKey: z.string(),
  })
  .strict()
export type RequestAuth = z.infer<typeof requestAuthSchema>

/**
 * How success is judged beyond the default "2xx is success". When omitted the
 * executor treats any 2xx as success; `httpStatusIn` widens/narrows that set.
 */
export const successWhenSchema = z
  .object({
    httpStatusIn: z.array(z.number().int()).optional(),
  })
  .strict()
export type SuccessWhen = z.infer<typeof successWhenSchema>

/**
 * One LLM/runtime-supplied parameter. The tool's JSON-schema (exposed to the
 * agent) is DERIVED from this list so the catalog and the call stay in lockstep.
 */
export const parameterMappingItemSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    required: z.boolean().default(false),
  })
  .strict()
export type ParameterMappingItem = z.infer<typeof parameterMappingItemSchema>

/**
 * Declarative HTTP call spec. CLOSED (`.strict()`): unknown keys are REJECTED so
 * a hostile/typo'd template can't smuggle fields the executor would ignore.
 *
 * `bodyTemplate` is a JSON STRING template (not a `z.record(...)`): the body is
 * stored as a raw string carrying `{{credentials.*}}` / `{{params.*}}`
 * placeholders that the executor substitutes and then parses. An object schema
 * (`z.record(z.string(), z.unknown())`) was rejected as too loose — it would
 * accept arbitrary nested JSON without preserving the exact serialization the
 * target API expects, and placeholders inside nested values would need bespoke
 * traversal. A string template keeps substitution uniform with headers/query.
 */
export const requestSpecSchema = z
  .object({
    method: requestMethodSchema,
    // Schema requires a URL string; the executor additionally enforces https +
    // SSRF guards at call time (see file header).
    url: z.string().url(),
    auth: requestAuthSchema,
    // Values may contain `{{credentials.*}}` / `{{params.*}}` placeholders.
    headers: z.record(z.string(), z.string()).optional(),
    // JSON body template as a STRING with placeholder leaves (see comment above).
    bodyTemplate: z.string().optional(),
    // Static query params; values may contain placeholders.
    queryParams: z.record(z.string(), z.string()).optional(),
    // Params the LLM/runtime supplies — the tool JSON-schema is derived from this.
    parameterMapping: z.array(parameterMappingItemSchema).optional(),
    // Sample params for the validation test call. For RD Station the template's
    // values carry a "TESTE Quayer — pode ignorar" marker; the marker lives in
    // the template DATA, not in this schema.
    testPayload: z.record(z.string(), z.unknown()).optional(),
    successWhen: successWhenSchema.optional(),
  })
  .strict()
export type RequestSpec = z.infer<typeof requestSpecSchema>

// ==========================================
// credentialFields — what secrets the user must supply
// ==========================================

/**
 * One credential field the user fills in to activate an integration. `key` is a
 * machine identifier (snake_case-ish) referenced by `requestAuth.credentialKey`
 * and by `{{credentials.<key>}}` placeholders; the rest is UI/validation
 * metadata. `formatRegex` is a STRING (the FE/executor compiles it) so the
 * persisted shape stays JSON-serializable.
 */
export const credentialFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string(),
    whereToGet: z.string(),
    formatRegex: z.string().optional(),
    placeholder: z.string().optional(),
  })
  .strict()
export type CredentialField = z.infer<typeof credentialFieldSchema>

export const credentialFieldsSchema = z.array(credentialFieldSchema)
export type CredentialFields = z.infer<typeof credentialFieldsSchema>

// ==========================================
// Route param + body schemas
// ==========================================

/**
 * Reusable path-param schema for lifecycle routes (activate/pause/resume/delete)
 * and test/credentials routes — `id` is the integration's id.
 */
export const integrationIdParamSchema = z.object({ id: z.string().uuid() }).strict()
export type IntegrationIdParam = z.infer<typeof integrationIdParamSchema>

/**
 * POST create-integration body. The integration originates EITHER from a known
 * catalog template (`templateSlug`) OR from the meta-agent's proposal currently
 * sitting in `builderState` (`proposalFromState: true`) — exactly one source
 * must be provided. `.strict()` rejects unknown keys; the `.refine` enforces the
 * "one source, not neither" invariant with a clear message.
 */
export const createIntegrationBodySchema = z
  .object({
    projectId: z.string().uuid(),
    templateSlug: z.string().optional(),
    proposalFromState: z.boolean().optional(),
    displayName: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (b) => Boolean(b.templateSlug) || b.proposalFromState === true,
    {
      message:
        'Informe templateSlug OU proposalFromState:true (uma origem é obrigatória)',
      path: ['templateSlug'],
    },
  )
export type CreateIntegrationBody = z.infer<typeof createIntegrationBodySchema>

/**
 * POST update-credentials body. `values` maps a credential field `key` → the
 * submitted secret value. These are WRITE-ONLY: they are stored in the secret
 * store and NEVER echoed back (reads return a "filled?" flag, not the value).
 */
export const updateCredentialsBodySchema = z
  .object({
    values: z.record(z.string(), z.string()),
  })
  .strict()
export type UpdateCredentialsBody = z.infer<typeof updateCredentialsBodySchema>

/**
 * POST test-integration body. No body is required to trigger the validation test
 * call (the spec's `testPayload` supplies the sample). Exported as an empty
 * strict, optional object so the route can declare a body schema uniformly.
 */
export const testIntegrationBodySchema = z.object({}).strict().optional()
export type TestIntegrationBody = z.infer<typeof testIntegrationBodySchema>
