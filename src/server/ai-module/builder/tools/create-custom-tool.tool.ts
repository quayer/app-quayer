/**
 * Builder Tool — create_custom_tool (US-009)
 *
 * Creates a custom webhook-based tool (AgentTool) that can be attached to
 * AI agents. Validates name format (snake_case), webhook URL, and description.
 *
 * The created AgentTool has type CUSTOM and is scoped to the organization.
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/

// SSRF guard — block URLs that would target internal infra when the Builder
// meta-agent persists a webhook URL drafted by the LLM. This is the WRITE-side
// guard; the runtime executor adds an equivalent check as belt-and-suspenders.
const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const INTERNAL_TLD_REGEX = /\.(?:internal|local|localhost)$/i

export function isWebhookUrlSafe(
  url: string,
): { ok: true } | { ok: false; reason: string } {
  let urlObj: URL
  try {
    urlObj = new URL(url)
  } catch {
    return { ok: false, reason: 'Invalid URL' }
  }

  if (urlObj.protocol !== 'https:') {
    return { ok: false, reason: 'Only HTTPS URLs are allowed' }
  }

  if (urlObj.port && urlObj.port !== '443') {
    return {
      ok: false,
      reason: `Port ${urlObj.port} is not allowed — only 443`,
    }
  }

  const hostname = urlObj.hostname.toLowerCase()

  if (hostname === 'localhost') {
    return { ok: false, reason: 'Hostname localhost is not allowed' }
  }

  if (INTERNAL_TLD_REGEX.test(hostname)) {
    return {
      ok: false,
      reason: 'Hostnames ending in .internal, .local, or .localhost are not allowed',
    }
  }

  // IPv6 literal: URL hostname drops the brackets but may keep zone id etc.
  // node's URL also strips brackets for .hostname. Detect by colon presence.
  if (hostname.includes(':')) {
    const v6 = hostname.replace(/^\[|\]$/g, '')
    if (v6 === '::1' || v6 === '::') {
      return { ok: false, reason: 'IPv6 loopback/unspecified addresses are not allowed' }
    }
    // fe80::/10 — link-local (fe80: through febf:)
    if (/^fe[89ab][0-9a-f]:/i.test(v6)) {
      return { ok: false, reason: 'IPv6 link-local addresses (fe80::/10) are not allowed' }
    }
    // fc00::/7 — unique-local (fc00:: through fdff::)
    if (/^f[cd][0-9a-f]{2}:/i.test(v6)) {
      return { ok: false, reason: 'IPv6 unique-local addresses (fc00::/7) are not allowed' }
    }
    return { ok: true }
  }

  const ipv4Match = hostname.match(IPV4_REGEX)
  if (ipv4Match) {
    const octets = [1, 2, 3, 4].map((i) => parseInt(ipv4Match[i], 10))
    if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
      return { ok: false, reason: 'Invalid IPv4 address' }
    }
    const [a, b] = octets
    // 0.0.0.0
    if (a === 0 && b === 0 && octets[2] === 0 && octets[3] === 0) {
      return { ok: false, reason: 'IPv4 0.0.0.0 is not allowed' }
    }
    // 127.0.0.0/8 — loopback
    if (a === 127) {
      return { ok: false, reason: 'IPv4 loopback range 127.0.0.0/8 is not allowed (private/internal)' }
    }
    // 10.0.0.0/8
    if (a === 10) {
      return { ok: false, reason: 'IPv4 private range 10.0.0.0/8 is not allowed' }
    }
    // 172.16.0.0/12 — 172.16.0.0 through 172.31.255.255
    if (a === 172 && b >= 16 && b <= 31) {
      return { ok: false, reason: 'IPv4 private range 172.16.0.0/12 is not allowed' }
    }
    // 192.168.0.0/16
    if (a === 192 && b === 168) {
      return { ok: false, reason: 'IPv4 private range 192.168.0.0/16 is not allowed' }
    }
    // 169.254.0.0/16 — link-local & cloud metadata
    if (a === 169 && b === 254) {
      return {
        ok: false,
        reason: 'IPv4 link-local range 169.254.0.0/16 (cloud metadata endpoints) is not allowed',
      }
    }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCustomToolTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'create_custom_tool',
    metadata: { isReadOnly: false, isConcurrencySafe: false },
    tool: tool({
      description:
        'Creates a custom webhook-based tool that can be attached to AI agents. The tool name must be snake_case (e.g., check_inventory, send_invoice). When the AI agent calls this tool, it will POST to the specified webhook URL with the tool parameters. Use this when the user wants to connect their agent to external APIs or business systems.',
      inputSchema: z.object({
        agentId: z
          .string()
          .uuid()
          .describe(
            'The AIAgentConfig.id this tool is being created for (used for context, not directly linked)',
          ),
        name: z
          .string()
          .min(2)
          .max(64)
          .describe(
            'Tool name in snake_case (e.g., check_inventory, send_invoice). Must start with a lowercase letter.',
          ),
        description: z
          .string()
          .min(10)
          .max(500)
          .describe(
            'Clear description of what this tool does. The AI agent reads this to decide when to call the tool.',
          ),
        webhookUrl: z
          .string()
          .url()
          .superRefine((url, ctx) => {
            const result = isWebhookUrlSafe(url)
            if (!result.ok) {
              ctx.addIssue({ code: 'custom', message: result.reason })
            }
          })
          .describe(
            'The webhook URL to POST to when the tool is invoked. Must be HTTPS on port 443, public hostname (no localhost, RFC1918, or cloud metadata endpoints).',
          ),
        webhookSecret: z
          .string()
          .optional()
          .describe(
            'Optional secret sent as X-Webhook-Secret header for authentication',
          ),
        parameters: z
          .record(z.unknown())
          .describe(
            'JSON Schema object describing the parameters the tool accepts (e.g., { "orderId": { "type": "string", "description": "..." } })',
          ),
      }),
      execute: async (input) => {
        try {
          // 1. Validate name format
          if (!SNAKE_CASE_REGEX.test(input.name)) {
            return {
              success: false,
              message: `Invalid tool name '${input.name}'. Must be snake_case: start with a lowercase letter, only lowercase letters, digits, and underscores.`,
            }
          }

          // 2. Verify the agent exists in this org (context validation)
          const agent = await database.aIAgentConfig.findFirst({
            where: {
              id: input.agentId,
              organizationId: ctx.organizationId,
            },
            select: { id: true },
          })

          if (!agent) {
            return {
              success: false,
              message: `Agent ${input.agentId} not found in this organization.`,
            }
          }

          // 3. Check for name uniqueness within the org
          const existing = await database.agentTool.findFirst({
            where: {
              organizationId: ctx.organizationId,
              name: input.name,
            },
            select: { id: true },
          })

          if (existing) {
            return {
              success: false,
              message: `A tool named '${input.name}' already exists in this organization. Choose a different name.`,
            }
          }

          // 4. Create the AgentTool
          const agentTool = await database.agentTool.create({
            data: {
              organizationId: ctx.organizationId,
              name: input.name,
              description: input.description,
              type: 'CUSTOM',
              webhookUrl: input.webhookUrl,
              webhookSecret: input.webhookSecret ?? null,
              parameters: input.parameters as Prisma.InputJsonValue,
              isActive: true,
            },
            select: { id: true, name: true },
          })

          return {
            success: true,
            toolId: agentTool.id,
            message: `Custom tool '${agentTool.name}' created successfully. Use attach_tool_to_agent to link it to an agent.`,
          }
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : 'Failed to create custom tool'
          return { success: false, message }
        }
      },
    }),
  })
}
