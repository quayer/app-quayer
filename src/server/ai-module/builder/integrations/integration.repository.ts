/**
 * Integration Builder — Repository (Wave 1, T11)
 *
 * Thin, org-scoped Prisma wrapper for the Integration Builder lifecycle. Owns
 * the composite operations that span `CustomIntegration` ⇄ `AgentTool` (1:1 via
 * `CustomIntegration.agentToolId @unique`) and the `IntegrationTestCall` audit
 * trail. Mirrors the style of `projects.repository.ts` (object of async
 * functions, `getDatabase()` per-call, `$transaction` for multi-step writes).
 *
 * INVARIANTS (load-bearing — do not relax):
 *  - 100% org-scoped: EVERY findFirst/findMany/update/delete filters by
 *    `organizationId`. Updates resolve the row with an org-scoped findFirst
 *    first, then write by primary key — `update({ where: { id } })` alone can't
 *    take a composite filter, so ownership is enforced before the write.
 *  - `status === 'active'` ⇄ `AgentTool.isActive` is kept in lockstep inside the
 *    same transaction (FR-08: `getCustomTools` filters on `isActive`).
 *  - Credential VALUES are write-only: `listIntegrations` NEVER selects the
 *    `credentials` column; `getIntegration` returns the full row (callers MUST
 *    NOT forward `credentials` to the wire — the route masks).
 *  - Active integrations are capped at 3 per org (`assertActiveIntegrationQuota`),
 *    counted INSIDE the activation transaction so count+activate are atomic.
 *    Soft-deleted rows (`deletedAt != null`) never count.
 *  - DELETE is a composite: SOFT-delete the CustomIntegration (set `deletedAt`,
 *    null out `agentToolId`) AND HARD-delete the AgentTool row in one
 *    transaction. Hard-deleting the AgentTool frees the snake_case `@@unique`
 *    name; the `SetNull` FK keeps the soft-deleted CustomIntegration alive for
 *    audit with `agentToolId = null`.
 *
 * Zero `any`. The transaction client is typed via `Prisma.TransactionClient`.
 */

import { Prisma } from '@prisma/client'
import type { IntegrationStatus } from '@prisma/client'
import { getDatabase } from '@/server/services/database'
import type { RequestSpec, CredentialFields } from './integration.schemas'

// ---------------------------------------------------------------------------
// Typed errors — surfaced to the route as discriminable failures (zero `any`).
// ---------------------------------------------------------------------------

/** Tag thrown by `assertActiveIntegrationQuota` when the org is at the cap. */
export const INTEGRATION_QUOTA_ERROR = 'INTEGRATION_ACTIVE_QUOTA_EXCEEDED' as const
/** Tag thrown by `createDraftIntegration` when the tool name already exists. */
export const INTEGRATION_NAME_CONFLICT = 'INTEGRATION_TOOL_NAME_CONFLICT' as const

/** Max number of `active` integrations per organization (soft-deleted excluded). */
export const MAX_ACTIVE_INTEGRATIONS = 3

/** Thrown when an org tries to activate a 4th integration. */
export class IntegrationQuotaError extends Error {
  readonly code = INTEGRATION_QUOTA_ERROR
  constructor(message = `Limite de ${MAX_ACTIVE_INTEGRATIONS} integrações ativas atingido.`) {
    super(message)
    this.name = 'IntegrationQuotaError'
  }
}

/** Thrown when the desired snake_case tool name is already taken in the org. */
export class IntegrationNameConflictError extends Error {
  readonly code = INTEGRATION_NAME_CONFLICT
  constructor(public readonly toolName: string) {
    super(`Já existe uma ferramenta chamada '${toolName}' nesta organização.`)
    this.name = 'IntegrationNameConflictError'
  }
}

// ---------------------------------------------------------------------------
// Select shapes
// ---------------------------------------------------------------------------

/**
 * Default list projection — explicitly OMITS the `credentials` column so secret
 * values can never leak through a list read (defence in depth: the route also
 * masks). Everything else the FE needs to render the list card is included.
 */
const LIST_SELECT = {
  id: true,
  organizationId: true,
  builderProjectId: true,
  agentToolId: true,
  templateSlug: true,
  displayName: true,
  status: true,
  triggerDescription: true,
  credentialFields: true,
  research: true,
  lastTestAt: true,
  lastTestStatus: true,
  lastTestErrorClass: true,
  lastErrorAt: true,
  lastErrorCode: true,
  createdById: true,
  validatedById: true,
  activatedById: true,
  validatedAt: true,
  activatedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomIntegrationSelect

/** Row shape returned by `listIntegrations` — never carries `credentials`. */
export type IntegrationListRow = Prisma.CustomIntegrationGetPayload<{
  select: typeof LIST_SELECT
}>

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Input for `createDraftIntegration`. `toolName` MUST be validated snake_case. */
export interface CreateDraftIntegrationInput {
  organizationId: string
  builderProjectId: string
  createdById: string
  displayName: string
  /** snake_case tool name — becomes `AgentTool.name` (subject to the org @@unique). */
  toolName: string
  templateSlug?: string | null
  triggerDescription?: string | null
  requestSpec: RequestSpec
  credentialFields: CredentialFields
  research?: Prisma.InputJsonValue | null
}

/** Input for `recordTestResult`. `outcome` matches the executor's classification. */
export interface RecordTestResultInput {
  organizationId: string
  id: string
  requestedById: string
  /** From `request-spec.ts` `classifyError` — success|auth_error|not_found|… */
  outcome: string
  /** `true` when `outcome === 'success'` (caller may also pass it explicitly). */
  success: boolean
  httpStatus?: number | null
  durationMs: number
}

/** Statuses an actor can be stamped against when calling `setStatus`. */
export type IntegrationActorField = 'validated' | 'activated'

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Lists non-deleted integrations of a project for an org. Org-scoped +
 * project-scoped + `deletedAt: null`. NEVER returns `credentials` (see
 * `LIST_SELECT`). Ordered newest-updated first.
 */
export async function listIntegrations(
  organizationId: string,
  builderProjectId: string,
): Promise<IntegrationListRow[]> {
  const database = getDatabase()
  return database.customIntegration.findMany({
    where: { organizationId, builderProjectId, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: LIST_SELECT,
  })
}

/**
 * Fetches a single non-deleted integration scoped to the org. Returns the FULL
 * row (including `credentials`) so lifecycle ops can read the stored secrets;
 * callers MUST NOT forward `credentials` to the wire — the route masks. Returns
 * `null` when the row does not exist, is soft-deleted, or belongs to another org
 * (does not leak existence).
 */
export async function getIntegration(
  organizationId: string,
  id: string,
): Promise<Prisma.CustomIntegrationGetPayload<object> | null> {
  const database = getDatabase()
  return database.customIntegration.findFirst({
    where: { id, organizationId, deletedAt: null },
  })
}

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------

/**
 * Asserts the org is below the active-integration cap. MUST run inside the
 * activation transaction (`tx`) so the count and the subsequent activate are
 * atomic — two concurrent activations can't both pass a stale count. Soft-deleted
 * rows do NOT count (`deletedAt: null`). Throws `IntegrationQuotaError` when the
 * org already has `MAX_ACTIVE_INTEGRATIONS` active integrations.
 */
export async function assertActiveIntegrationQuota(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const activeCount = await tx.customIntegration.count({
    where: { organizationId, status: 'active', deletedAt: null },
  })
  if (activeCount >= MAX_ACTIVE_INTEGRATIONS) {
    throw new IntegrationQuotaError()
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Creates a draft integration + its backing `AgentTool` (inactive) in one
 * transaction. The AgentTool is created `isActive: false`, `type: 'CUSTOM'`,
 * `name: toolName` (stored as-is, snake_case — mirrors create-custom-tool.tool.ts),
 * with `parameters` derived from `requestSpec.parameterMapping` (null when the
 * spec declares no LLM-supplied params). The CustomIntegration links to it via
 * `agentToolId` and starts in `status: 'draft'`.
 *
 * The org's `@@unique([organizationId, name])` on AgentTool is checked up-front
 * (org-scoped findFirst) and again caught at the constraint level — a duplicate
 * surfaces as a typed `IntegrationNameConflictError`.
 */
export async function createDraftIntegration(
  input: CreateDraftIntegrationInput,
): Promise<Prisma.CustomIntegrationGetPayload<object>> {
  const database = getDatabase()

  // Up-front org-scoped uniqueness check (cheap, gives a clean typed error
  // before we open the transaction). The DB @@unique is the real guard.
  const existing = await database.agentTool.findFirst({
    where: { organizationId: input.organizationId, name: input.toolName },
    select: { id: true },
  })
  if (existing) {
    throw new IntegrationNameConflictError(input.toolName)
  }

  // Tool parameters are DERIVED from the declarative requestSpec so the catalog
  // and the call stay in lockstep (JSON-schema-ish object keyed by param name).
  const parameters: Prisma.InputJsonValue | null = deriveToolParameters(
    input.requestSpec,
  )

  try {
    return await database.$transaction(async (tx) => {
      const agentTool = await tx.agentTool.create({
        data: {
          organizationId: input.organizationId,
          name: input.toolName,
          description:
            input.triggerDescription?.trim() ||
            `Integração: ${input.displayName}`,
          type: 'CUSTOM',
          parameters: parameters ?? Prisma.JsonNull,
          isActive: false,
        },
        select: { id: true },
      })

      return tx.customIntegration.create({
        data: {
          organizationId: input.organizationId,
          builderProjectId: input.builderProjectId,
          agentToolId: agentTool.id,
          templateSlug: input.templateSlug ?? null,
          displayName: input.displayName,
          status: 'draft',
          triggerDescription: input.triggerDescription ?? null,
          requestSpec: input.requestSpec as unknown as Prisma.InputJsonValue,
          credentialFields:
            input.credentialFields as unknown as Prisma.InputJsonValue,
          research: input.research ?? Prisma.JsonNull,
          createdById: input.createdById,
        },
      })
    })
  } catch (err) {
    // Race: another request grabbed the name between the pre-check and the
    // INSERT. Surface the same typed conflict.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new IntegrationNameConflictError(input.toolName)
    }
    throw err
  }
}

/**
 * Builds the AgentTool `parameters` JSON-schema object from the spec's
 * `parameterMapping`. Returns `null` when the spec declares no LLM-supplied
 * params (so the tool advertises no arguments). Shape mirrors the JSON-schema
 * object create-custom-tool.tool.ts stores: `{ <name>: { type, description } }`
 * plus a `required` list for the params flagged required.
 */
function deriveToolParameters(
  requestSpec: RequestSpec,
): Prisma.InputJsonValue | null {
  const mapping = requestSpec.parameterMapping
  if (!mapping || mapping.length === 0) return null

  const properties: Record<string, { type: 'string'; description: string }> = {}
  const required: string[] = []
  for (const param of mapping) {
    properties[param.name] = { type: 'string', description: param.description }
    if (param.required) required.push(param.name)
  }

  return { type: 'object', properties, required }
}

// ---------------------------------------------------------------------------
// Credentials (write-only)
// ---------------------------------------------------------------------------

/**
 * Persists the encrypted credential map. The ROUTE has already encrypted each
 * value (per-field, lib/crypto) — this repo just stores the blob. Org-scoped:
 * resolves ownership with an org-scoped findFirst, then writes by id. Returns
 * the updated row, or `null` when the integration is not found / not owned /
 * soft-deleted.
 */
export async function updateCredentials(
  organizationId: string,
  id: string,
  encryptedCredentials: Record<string, string>,
): Promise<Prisma.CustomIntegrationGetPayload<object> | null> {
  const database = getDatabase()
  const owned = await database.customIntegration.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true },
  })
  if (!owned) return null

  return database.customIntegration.update({
    where: { id: owned.id },
    data: {
      credentials: encryptedCredentials as unknown as Prisma.InputJsonValue,
    },
  })
}

// ---------------------------------------------------------------------------
// Test results
// ---------------------------------------------------------------------------

/**
 * Records the result of a validation test call:
 *  - stamps `lastTestAt` / `lastTestStatus` (the outcome code) /
 *    `lastTestErrorClass` (null on success);
 *  - on success, transitions `draft → validated` ONLY when the current status is
 *    `draft` or `validated` — NEVER downgrades an `active`/`paused`/`error` row;
 *  - inserts an `IntegrationTestCall` audit row in the SAME transaction.
 *
 * Org-scoped: ownership resolved up-front. Returns the updated row, or `null`
 * when not found / not owned / soft-deleted.
 */
export async function recordTestResult(
  input: RecordTestResultInput,
): Promise<Prisma.CustomIntegrationGetPayload<object> | null> {
  const database = getDatabase()
  const owned = await database.customIntegration.findFirst({
    where: { id: input.id, organizationId: input.organizationId, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!owned) return null

  // Only promote draft/validated to validated on success; never downgrade.
  const nextStatus: IntegrationStatus | undefined =
    input.success && (owned.status === 'draft' || owned.status === 'validated')
      ? 'validated'
      : undefined

  const now = new Date()

  return database.$transaction(async (tx) => {
    await tx.integrationTestCall.create({
      data: {
        integrationId: owned.id,
        organizationId: input.organizationId,
        requestedById: input.requestedById,
        outcome: input.outcome,
        httpStatus: input.httpStatus ?? null,
        durationMs: input.durationMs,
      },
    })

    return tx.customIntegration.update({
      where: { id: owned.id },
      data: {
        lastTestAt: now,
        lastTestStatus: input.outcome,
        lastTestErrorClass: input.success ? null : input.outcome,
        ...(nextStatus ? { status: nextStatus, validatedAt: now } : {}),
      },
    })
  })
}

// ---------------------------------------------------------------------------
// Lifecycle status
// ---------------------------------------------------------------------------

/**
 * Sets the integration status and mirrors `AgentTool.isActive` in the SAME
 * transaction (`true` ⇔ `status === 'active'`, `false` otherwise). When
 * `actorField` is provided, stamps the matching actor + timestamp pair:
 *   - 'validated' → validatedById + validatedAt
 *   - 'activated' → activatedById + activatedAt
 *
 * For `status === 'active'`, the caller is responsible for running
 * `assertActiveIntegrationQuota(tx, ...)` BEFORE this; this function performs the
 * write only. Org-scoped: ownership resolved up-front (with `agentToolId` so the
 * mirror write targets the right AgentTool). Returns the updated row, or `null`
 * when not found / not owned / soft-deleted.
 */
export async function setStatus(
  organizationId: string,
  id: string,
  status: IntegrationStatus,
  actor?: { field: IntegrationActorField; userId: string },
): Promise<Prisma.CustomIntegrationGetPayload<object> | null> {
  const database = getDatabase()
  const owned = await database.customIntegration.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, agentToolId: true },
  })
  if (!owned) return null

  const now = new Date()
  const actorData: Prisma.CustomIntegrationUpdateInput =
    actor?.field === 'validated'
      ? { validatedById: actor.userId, validatedAt: now }
      : actor?.field === 'activated'
        ? { activatedById: actor.userId, activatedAt: now }
        : {}

  return database.$transaction(async (tx) => {
    const updated = await tx.customIntegration.update({
      where: { id: owned.id },
      data: { status, ...actorData },
    })

    // Mirror the runtime catalog flag (FR-08). When the FK was already nulled
    // (post-delete) there is nothing to mirror.
    if (owned.agentToolId) {
      await tx.agentTool.update({
        where: { id: owned.agentToolId },
        data: { isActive: status === 'active' },
      })
    }

    return updated
  })
}

// ---------------------------------------------------------------------------
// Delete (composite)
// ---------------------------------------------------------------------------

/**
 * Composite delete in one transaction:
 *  - SOFT-deletes the CustomIntegration (`deletedAt = now`, `agentToolId = null`)
 *    so the audit trail (incl. `IntegrationTestCall` rows) survives;
 *  - HARD-deletes the backing AgentTool row, which FREES the snake_case
 *    `@@unique([organizationId, name])` name for reuse.
 *
 * The `SetNull` FK means the soft-deleted CustomIntegration stays alive with
 * `agentToolId = null`. Org-scoped: ownership resolved up-front. Returns
 * `{ id }` of the soft-deleted integration, or `null` when not found / not
 * owned / already soft-deleted.
 */
export async function deleteIntegration(
  organizationId: string,
  id: string,
): Promise<{ id: string } | null> {
  const database = getDatabase()
  const owned = await database.customIntegration.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, agentToolId: true },
  })
  if (!owned) return null

  return database.$transaction(async (tx) => {
    // Soft-delete the integration FIRST and null the FK so the subsequent hard
    // delete of the AgentTool doesn't trip the SetNull mid-flight ambiguity.
    await tx.customIntegration.update({
      where: { id: owned.id },
      data: { deletedAt: new Date(), agentToolId: null },
    })

    if (owned.agentToolId) {
      // Hard delete frees the @@unique name. Org-scoped deleteMany (defence in
      // depth — the AgentTool also carries organizationId).
      await tx.agentTool.deleteMany({
        where: { id: owned.agentToolId, organizationId },
      })
    }

    return { id: owned.id }
  })
}

// ---------------------------------------------------------------------------
// Aggregate export — mirrors the `builderProjectRepository` object style.
// ---------------------------------------------------------------------------

export const integrationRepository = {
  listIntegrations,
  getIntegration,
  assertActiveIntegrationQuota,
  createDraftIntegration,
  updateCredentials,
  recordTestResult,
  setStatus,
  deleteIntegration,
}

export type IntegrationRepository = typeof integrationRepository
