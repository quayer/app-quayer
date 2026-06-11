/**
 * Integration Builder — credential TEST runner (Wave 1, T14)
 *
 * Orchestrates a single VALIDATION TEST of a custom integration. This is the
 * ONLY place in the codebase where stored integration credentials are
 * decrypted — they are decrypted in-memory, handed straight to the shared
 * executor (T10), and discarded. They are NEVER logged, persisted, or returned.
 *
 * Flow:
 *   1. Load the integration org-scoped (`getIntegration`). Missing/foreign/
 *      soft-deleted → a never-throw `not_found` result the route maps cleanly.
 *   2. Parse the stored `requestSpec` Json back into a `RequestSpec` via the
 *      Zod schema (defence in depth: it was validated on create, re-parse here
 *      guarantees the executor receives a well-formed spec).
 *   3. Decrypt the `{ key: ciphertext }` credential map into `{ key: plaintext }`
 *      — the SINGLE decryption site. Empty/absent credentials are tolerated (the
 *      call still runs; it will typically surface `auth_error`).
 *   4. Resolve params: caller-supplied `params` ?? the spec's `testPayload` ?? {}.
 *   5. Call `runIntegrationCall(spec, creds, params, { mode: 'test', … })`.
 *   6. Persist via `recordTestResult` — stamps lastTest* + (on success only)
 *      transitions draft→validated + inserts an `IntegrationTestCall` audit row
 *      carrying ONLY outcome/httpStatus/durationMs (no payloads, no secrets).
 *   7. Write an `AuditLog` `integration.test_run` row whose `metadata` carries
 *      ONLY outcome/httpStatus/durationMs (never credentials or bodies).
 *   8. Return ONLY value-free signals: outcome/diagnosis/httpStatus/durationMs.
 *
 * SECURITY: the decrypted credentials and the executor's `bodySnippet` MUST
 * NEVER leave this function — neither are referenced after the executor call.
 *
 * Zero `any`.
 */

import { Prisma } from '@prisma/client'
import { decrypt } from '@/lib/crypto'
import { getDatabase } from '@/server/services/database'
import {
  runIntegrationCall,
  type IntegrationOutcome,
} from '@/server/ai-module/ai-agents/tools/integration-executor'
import { requestSpecSchema, type RequestSpec } from './integration.schemas'
import { getIntegration, recordTestResult } from './integration.repository'

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

/** Input for {@link runIntegrationTest}. `params` defaults to the spec `testPayload`. */
export interface RunIntegrationTestInput {
  organizationId: string
  integrationId: string
  requestedById: string
  /** Optional override params; when omitted the spec's `testPayload` is used. */
  params?: Record<string, unknown>
}

/**
 * Result of {@link runIntegrationTest}. Carries ONLY value-free signals safe to
 * surface to the user/route: the coarse `outcome`, the leiga pt-BR `diagnosis`,
 * the HTTP status (when there was a response) and the wall-clock `durationMs`.
 * NEVER carries credentials, request/response bodies, or the executor snippet.
 */
export interface RunIntegrationTestResult {
  outcome: IntegrationOutcome
  diagnosis: string
  httpStatus?: number
  durationMs: number
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Run a credential test for one integration. Never throws for the not-found /
 * not-owned case (returns a neutral `not_found` result so the route maps it to a
 * clean response). See the file header for the full security contract.
 */
export async function runIntegrationTest(
  input: RunIntegrationTestInput,
): Promise<RunIntegrationTestResult> {
  const { organizationId, integrationId, requestedById } = input

  // 1. Load org-scoped. Missing / foreign / soft-deleted → neutral not_found.
  const integration = await getIntegration(organizationId, integrationId)
  if (!integration) {
    return {
      outcome: 'not_found',
      diagnosis: 'Integração não encontrada.',
      durationMs: 0,
    }
  }

  // 2. Re-parse the stored requestSpec back into a typed RequestSpec. It was
  //    validated on create; re-parsing guarantees the executor gets a clean
  //    shape (defence in depth — a malformed/legacy row maps to schema_error).
  let spec: RequestSpec
  try {
    spec = requestSpecSchema.parse(integration.requestSpec)
  } catch {
    return {
      outcome: 'schema_error',
      diagnosis:
        'A configuração da integração está inválida. Refaça a integração para corrigir.',
      durationMs: 0,
    }
  }

  // 3. Decrypt credentials — THE ONLY decryption site. The stored shape is
  //    `{ key: ciphertext }`; build `{ key: plaintext }`. Absent/empty creds are
  //    tolerated (the executor will typically yield auth_error rather than crash).
  const decryptedCredentials = decryptCredentials(integration.credentials)

  // 4. Resolve params: caller override ?? spec testPayload ?? {}.
  const params: Record<string, unknown> =
    input.params ?? spec.testPayload ?? {}

  // 5. Call the shared executor in TEST mode (the single place the real request
  //    is assembled + sent). It NEVER throws — every failure maps to an outcome.
  const result = await runIntegrationCall(spec, decryptedCredentials, params, {
    mode: 'test',
    integrationId,
    organizationId,
  })

  // From here on `decryptedCredentials` and `result.bodySnippet` are NEVER read
  // again — only value-free signals proceed.
  const success = result.outcome === 'success'

  // 6. Persist the test result (stamps lastTest*, transitions draft→validated on
  //    success, inserts an IntegrationTestCall with NO payloads / NO credentials).
  await recordTestResult({
    organizationId,
    id: integrationId,
    requestedById,
    outcome: result.outcome,
    success,
    httpStatus: result.httpStatus ?? null,
    durationMs: result.durationMs,
  })

  // 7. AuditLog `integration.test_run`. metadata is value-free by construction:
  //    ONLY outcome/httpStatus/durationMs — never credentials or bodies. Built
  //    as an InputJsonValue (httpStatus omitted when absent rather than `undefined`).
  const metadata: Prisma.InputJsonValue = {
    outcome: result.outcome,
    durationMs: result.durationMs,
    ...(result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}),
  }
  await getDatabase().auditLog.create({
    data: {
      action: 'integration.test_run',
      resource: 'custom_integration',
      resourceId: integrationId,
      userId: requestedById,
      organizationId,
      metadata,
    },
  })

  // 8. Return ONLY value-free signals (no credentials, no bodies, no snippet).
  return {
    outcome: result.outcome,
    diagnosis: result.diagnosis,
    httpStatus: result.httpStatus,
    durationMs: result.durationMs,
  }
}

// ---------------------------------------------------------------------------
// Credential decryption — the SINGLE decryption site.
// ---------------------------------------------------------------------------

/**
 * Turns the stored `{ key: ciphertext }` Json into `{ key: plaintext }`. Returns
 * an empty map when credentials are absent/empty/malformed (the test still runs;
 * a missing secret surfaces downstream as `auth_error`, never a crash). The
 * returned plaintext map NEVER leaves the caller's stack frame.
 */
function decryptCredentials(stored: unknown): Record<string, string> {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
    return {}
  }

  const decrypted: Record<string, string> = {}
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof value !== 'string') continue
    decrypted[key] = decrypt(value)
  }
  return decrypted
}
