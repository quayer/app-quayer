/**
 * select_channel — Builder tool (Wave 1.1)
 *
 * Returns the catalog of messaging channels the user can pick from to
 * connect their freshly-built agent. Purely presentational: emits a rich
 * ChannelPickerCard in the chat; no database writes.
 *
 * The LLM calls this when the user reaches the "channel" stage of the
 * Builder flow (post-prompt, pre-deploy) OR when the user explicitly
 * asks which channels are supported.
 *
 * The card's click handler posts a new user message ("Quero usar X") that
 * the LLM then translates into `create_whatsapp_instance` or the Instagram
 * manual wizard (Wave 3.1).
 */

import { tool } from 'ai'
import { z } from 'zod'
import { buildBuilderTool } from './build-tool'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface BuilderToolExecutionContext {
  projectId: string
  organizationId: string
  userId: string
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * Canonical channel catalog. Mirrors the keys used on the frontend
 * ChannelPickerCard so the dispatcher can render without a mapping.
 *
 * SINGLE SOURCE OF TRUTH: `card-submit.schemas.ts` derives its `CHANNEL_KEYS`
 * (the Zod enum + server-side re-validation gate) from `CHANNEL_KEYS` below, so
 * the catalog and the card contract can never drift.
 */
export const CHANNEL_CATALOG = [
  {
    key: 'cloudapi' as const,
    title: 'WhatsApp Cloud API',
    description: 'API oficial da Meta. Mais estável, requer aprovação.',
    requiresApproval: true,
  },
  {
    key: 'uazapi' as const,
    title: 'WhatsApp Business',
    description: 'Pareamento por QR Code. Rápido, sem aprovação.',
    requiresApproval: false,
  },
  {
    key: 'instagram' as const,
    title: 'Instagram Direct',
    description: 'DMs via Meta Graph API. Requer Meta App + webhook.',
    requiresApproval: true,
  },
] as const

/**
 * Canonical channel keys, derived from `CHANNEL_CATALOG`. This is the ONE source
 * of truth consumed by `card-submit.schemas.ts` (Zod enum + isValidChannelKey).
 * Typed as a non-empty tuple so `z.enum(...)` accepts it directly.
 */
export const CHANNEL_KEYS = CHANNEL_CATALOG.map((c) => c.key) as [
  (typeof CHANNEL_CATALOG)[number]['key'],
  ...(typeof CHANNEL_CATALOG)[number]['key'][],
]
export type ChannelKey = (typeof CHANNEL_KEYS)[number]

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function selectChannelTool(_ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'select_channel',
    metadata: { isReadOnly: true, isConcurrencySafe: true },
    tool: tool({
      description:
        'Presents the user with the catalog of messaging channels (WhatsApp Cloud API, WhatsApp Business via QR, Instagram Direct) and asks them to pick one. Use this at the "channel" stage after an agent is built and before deployment, or when the user asks which channels are supported. Does NOT create an instance — the click handler will post a follow-up user message that triggers create_whatsapp_instance or the Instagram wizard.',
      inputSchema: z.object({
        reason: z
          .string()
          .max(200)
          .optional()
          .describe(
            'Optional short context shown above the picker. E.g. "Seu agente está pronto — em qual canal quer publicar?"',
          ),
      }),
      execute: async (input) => {
        return {
          success: true as const,
          reason: input.reason ?? null,
          channels: CHANNEL_CATALOG,
          message: 'Exibindo catálogo de canais para o usuário escolher.',
        }
      },
    }),
  })
}
