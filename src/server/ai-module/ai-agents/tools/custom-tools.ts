/**
 * Custom (webhook-backed) Tools for AI Agents
 *
 * Companion to `builtin-tools.ts`. Reads `AgentTool` rows of `type: 'CUSTOM'`
 * from the DB for the current organization and exposes them as Vercel AI SDK
 * `tool()` definitions. When the LLM calls a custom tool, we POST the input
 * JSON to the stored `webhookUrl`, applying a timeout and a basic SSRF guard.
 *
 * Design notes:
 * - Tools are resolved per message turn (fresh DB read), so edits made via
 *   the Builder take effect on the next turn without a process restart.
 * - `execute` NEVER throws. All failure modes are returned as structured
 *   `{ success: false, ... }` objects so the LLM can narrate the failure
 *   to the end user.
 * - SSRF: we block obviously-internal hosts and non-HTTPS URLs at runtime
 *   in addition to whatever write-side validation the Builder performs.
 */

import { tool, type Tool } from 'ai'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import { decrypt } from '@/lib/crypto'
import { logger } from '@/server/services/logger'
import type { ToolExecutionContext } from './builtin-tools'
import { runIntegrationCall } from './integration-executor'
import { sanitizeForLog } from '../../builder/integrations/request-spec'
import { requestSpecSchema } from '../../builder/integrations/integration.schemas'

// ---------------------------------------------------------------------------
// JSONSchema → Zod converter (tight, minimal)
// ---------------------------------------------------------------------------

type JsonSchema = {
  type?: string
  description?: string
  enum?: unknown[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
}

/**
 * Convert a JSONSchema fragment (as stored in `AgentTool.parameters`) into a
 * Zod schema. Fail-open for unknown shapes — prefer exposing the tool to the
 * LLM over hiding it; the webhook can still validate its own inputs.
 */
export function jsonSchemaToZod(schema: unknown): z.ZodType<any> {
  if (!schema || typeof schema !== 'object') {
    return z.unknown()
  }

  const s = schema as JsonSchema
  const describe = (node: z.ZodType<any>) =>
    typeof s.description === 'string' && s.description.length > 0
      ? node.describe(s.description)
      : node

  switch (s.type) {
    case 'object': {
      const props = s.properties ?? {}
      const required = new Set(s.required ?? [])
      const shape: Record<string, z.ZodType<any>> = {}
      for (const [key, value] of Object.entries(props)) {
        const child = jsonSchemaToZod(value)
        shape[key] = required.has(key) ? child : child.optional()
      }
      return describe(z.object(shape))
    }

    case 'string': {
      if (Array.isArray(s.enum) && s.enum.length > 0) {
        const values = s.enum.filter((v): v is string => typeof v === 'string')
        if (values.length > 0) {
          return describe(z.enum(values as [string, ...string[]]))
        }
      }
      return describe(z.string())
    }

    case 'number':
    case 'integer':
      return describe(z.number())

    case 'boolean':
      return describe(z.boolean())

    case 'array': {
      const items = s.items ? jsonSchemaToZod(s.items) : z.unknown()
      return describe(z.array(items))
    }

    default:
      return describe(z.unknown())
  }
}

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------

const PRIVATE_HOST_REGEX =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/

/**
 * Belt-and-suspenders runtime check. Write-side validation (Builder tool
 * creation) is the primary defence, but we re-check here so that rotated or
 * tampered rows can't reach internal hosts.
 */
export function isWebhookUrlBlocked(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') return true
    if (PRIVATE_HOST_REGEX.test(url.hostname)) return true
    return false
  } catch {
    return true
  }
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

const MAX_RESPONSE_BYTES = 8 * 1024 // 8 KB

/**
 * Build a map of Vercel AI SDK tools from the org's active CUSTOM AgentTool
 * rows whose names appear in the agent's `enabledTools` list.
 *
 * Returns `{}` when the agent has no enabled tool names to save a DB hit.
 */
export async function getCustomTools(
  enabledTools: string[],
  ctx: ToolExecutionContext,
): Promise<Record<string, Tool>> {
  if (!enabledTools || enabledTools.length === 0) {
    return {}
  }

  const rows = await database.agentTool.findMany({
    where: {
      organizationId: ctx.organizationId,
      type: 'CUSTOM',
      isActive: true,
      name: { in: enabledTools },
      // Either the v1 webhook path (webhookUrl set) OR a declarative integration
      // that is ACTIVE. An active integration mirrors isActive=true (FR-08), so a
      // backing integration with no webhookUrl is still surfaced to the LLM.
      OR: [
        { webhookUrl: { not: null } },
        { customIntegration: { status: 'active', deletedAt: null } },
      ],
    },
    select: {
      id: true,
      name: true,
      description: true,
      parameters: true,
      webhookUrl: true,
      webhookSecret: true,
      webhookTimeout: true,
      // Integration Builder backing row (inverse 1:1). Selected so an active
      // integration can delegate to the shared declarative executor.
      customIntegration: {
        select: {
          id: true,
          status: true,
          deletedAt: true,
          requestSpec: true,
          credentials: true,
          organizationId: true,
        },
      },
    },
  })

  const out: Record<string, Tool> = {}

  for (const row of rows) {
    const inputSchema = jsonSchemaToZod(row.parameters) as z.ZodType<any>

    // --- Integration Builder path -------------------------------------------
    // A row backed by an ACTIVE integration delegates to the shared declarative
    // executor (`runIntegrationCall`) instead of the v1 webhook POST. This file
    // serves both the playground and the production runtime, so wiring it here
    // gives FR-08 parity by construction.
    const integration = row.customIntegration
    if (integration && integration.status === 'active' && integration.deletedAt === null) {
      out[row.name] = tool({
        description: row.description,
        inputSchema,
        execute: buildIntegrationExecute(integration),
      })
      continue
    }

    // --- v1 webhook path ----------------------------------------------------
    const webhookUrl = row.webhookUrl
    if (!webhookUrl) continue // safety, already filtered in query

    out[row.name] = tool({
      description: row.description,
      inputSchema,
      execute: async (input: unknown) => {
        // --- SSRF guard -----------------------------------------------------
        if (isWebhookUrlBlocked(webhookUrl)) {
          return {
            success: false,
            error: 'Webhook URL blocked by security policy',
          }
        }

        // --- Invoke webhook -------------------------------------------------
        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          }
          if (row.webhookSecret) {
            // O segredo é gravado CIFRADO (create-custom-tool.tool.ts → encrypt);
            // sem decrypt aqui o webhook do cliente recebia o ciphertext e a
            // validação nunca passava. Fail-open para rows legadas em claro.
            try {
              headers['X-Webhook-Secret'] = decrypt(row.webhookSecret)
            } catch {
              headers['X-Webhook-Secret'] = row.webhookSecret
            }
          }

          const res = await fetch(webhookUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(input ?? {}),
            signal: AbortSignal.timeout(row.webhookTimeout),
          })

          if (!res.ok) {
            return {
              success: false,
              status: res.status,
              error: `Webhook returned ${res.status}`,
            }
          }

          // Cap body read to avoid memory bombs.
          const raw = await readCapped(res, MAX_RESPONSE_BYTES)
          let parsed: unknown
          try {
            parsed = raw.length > 0 ? JSON.parse(raw) : null
          } catch {
            parsed = raw
          }

          return { success: true, data: parsed }
        } catch (err) {
          const e = err as { name?: string; message?: string }
          return {
            success: false,
            error: e?.message ?? 'Unknown error',
            code: e?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK',
          }
        }
      },
    })
  }

  return out
}

// ---------------------------------------------------------------------------
// Integration Builder execute (declarative integration → shared executor)
// ---------------------------------------------------------------------------

/**
 * The CustomIntegration fields selected alongside an AgentTool row. Derived from
 * the generated Prisma payload so it stays in lockstep with the relation select
 * above (the client was regenerated with the `customIntegration` inverse relation).
 */
type IntegrationRow = Prisma.CustomIntegrationGetPayload<{
  select: {
    id: true
    status: true
    deletedAt: true
    requestSpec: true
    credentials: true
    organizationId: true
  }
}>

/**
 * Neutral pt-BR hint surfaced to the LLM on ANY integration failure (FR-10/NFR-07).
 * MUST stay generic: it NEVER contains a technical error, an HTTP status, a URL, or
 * any credential — the LLM may relay it verbatim to the end user.
 */
const INTEGRATION_USER_FACING_HINT =
  'Não consegui concluir essa ação agora. Tente novamente em instantes ou avise o suporte.'

/**
 * Decrypt the integration's stored credential values per call (never cached) into
 * a `Record<string,string>` keyed by credential field `key`. Each value was stored
 * CIFRADO (one per `lib/crypto.encrypt`); fail-open per value for legacy plaintext.
 */
function decryptCredentials(raw: Prisma.JsonValue | null): Record<string, string> {
  const creds: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return creds
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') continue
    try {
      creds[key] = decrypt(value)
    } catch {
      creds[key] = value
    }
  }
  return creds
}

/**
 * Derive the SHORT, value-free error class persisted in `CustomIntegration.lastErrorCode`.
 * This is a coarse classifier (the HTTP status when present, else the outcome union
 * member) — NEVER a response payload, header, URL, or credential (FR-10/NFR-07).
 */
function errorCodeOf(result: { outcome: string; httpStatus?: number }): string {
  return result.httpStatus ? String(result.httpStatus) : result.outcome
}

/**
 * Fail-open observability writeback after a PERSISTENT integration failure (i.e. the
 * executor already exhausted its single production retry). Flags the row `status='error'`
 * with the timestamp and the short error class. STRICTLY best-effort:
 *  - a DB failure here MUST NOT propagate (the turn must survive) → wrapped in try/catch;
 *  - the swallowed DB error is logged via the repo logger through `sanitizeForLog`, so the
 *    log line carries only whitelisted, secret-free keys (no payload / URL / credential).
 * NEVER throws.
 */
async function writebackIntegrationError(
  integration: IntegrationRow,
  result: { outcome: string; httpStatus?: number },
): Promise<void> {
  try {
    await database.customIntegration.update({
      where: { id: integration.id },
      data: {
        status: 'error',
        lastErrorAt: new Date(),
        lastErrorCode: errorCodeOf(result),
      },
    })
  } catch {
    // Best-effort: the writeback is observability, never load-bearing. Log the
    // failure (sanitized — no secrets/URLs/payloads) and keep going so the turn
    // still resolves with the safe hint.
    logger.warn(
      '[custom-tools] integration error writeback failed',
      sanitizeForLog({
        integrationId: integration.id,
        organizationId: integration.organizationId,
        outcome: result.outcome,
        httpStatus: result.httpStatus,
      }),
    )
  }
}

/**
 * Build the `execute` for an AgentTool backed by an ACTIVE integration. Delegates
 * to the shared `runIntegrationCall` executor (same code path as the test/test-call
 * route → FR-08 parity).
 *
 * CONTRACT — this `execute` NEVER throws. The runtime relies on it always resolving:
 * every failure mode (malformed spec, persistent executor failure, an unexpected
 * error anywhere in the path) is caught and turned into the SAFE tool result
 * `{ success: false, userFacingHint }` plus a best-effort error writeback. The hint
 * is generic pt-BR and carries no technical detail (FR-10/NFR-07).
 */
function buildIntegrationExecute(
  integration: IntegrationRow,
): (input: unknown) => Promise<unknown> {
  return async (input: unknown) => {
    try {
      // Parse the persisted spec. A malformed spec is a config error, not a turn
      // failure → safe hint (never throw).
      const specParsed = requestSpecSchema.safeParse(integration.requestSpec)
      if (!specParsed.success) {
        return { success: false, userFacingHint: INTEGRATION_USER_FACING_HINT }
      }

      // Per-call decrypt; never cache plaintext.
      const credentials = decryptCredentials(integration.credentials)
      const params =
        input && typeof input === 'object' && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : {}

      const result = await runIntegrationCall(specParsed.data, credentials, params, {
        mode: 'production',
        integrationId: integration.id,
        organizationId: integration.organizationId,
      })

      if (result.outcome !== 'success') {
        // PERSISTENT failure (the executor already applied its prod retry). Flag the
        // row for observability — best-effort, never sinks the turn — then return the
        // neutral hint with NO technical detail.
        await writebackIntegrationError(integration, result)
        return { success: false, userFacingHint: INTEGRATION_USER_FACING_HINT }
      }

      // Success: hand the (capped) response body back so the LLM can use it.
      let data: unknown = result.bodySnippet ?? null
      if (typeof data === 'string' && data.length > 0) {
        try {
          data = JSON.parse(data)
        } catch {
          // keep the raw string if it isn't JSON
        }
      }
      return { success: true, data }
    } catch (err) {
      // Unexpected error anywhere in the path (e.g. the executor unexpectedly threw,
      // a decrypt blew up): honour the never-throws contract. Best-effort writeback
      // with a coarse 'network' class, then the safe hint. The raw error is NEVER
      // surfaced to the LLM and NEVER logged with a payload.
      await writebackIntegrationError(integration, { outcome: 'network' })
      void err
      return { success: false, userFacingHint: INTEGRATION_USER_FACING_HINT }
    }
  }
}

/**
 * Read a `fetch` Response body as text but stop after `maxBytes` to prevent
 * a malicious webhook from exhausting memory.
 */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  // Simpler, universally-supported path: read the full text then slice.
  // Node's global fetch lacks a trivial abort-on-bytes API and we've already
  // bounded this by the per-request timeout, so a hard slice is good enough.
  const text = await res.text()
  return text.length > maxBytes ? text.slice(0, maxBytes) : text
}
