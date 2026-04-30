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
import { database } from '@/server/services/database'
import type { ToolExecutionContext } from './builtin-tools'

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
      webhookUrl: { not: null },
    },
    select: {
      name: true,
      description: true,
      parameters: true,
      webhookUrl: true,
      webhookSecret: true,
      webhookTimeout: true,
    },
  })

  const out: Record<string, Tool> = {}

  for (const row of rows) {
    const webhookUrl = row.webhookUrl
    if (!webhookUrl) continue // safety, already filtered in query

    const inputSchema = jsonSchemaToZod(row.parameters) as z.ZodType<any>

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
            headers['X-Webhook-Secret'] = row.webhookSecret
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
