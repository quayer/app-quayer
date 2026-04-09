/**
 * Builder Tool — create_whatsapp_instance (US-012)
 *
 * Creates a new WhatsApp `Connection` for the current organization and returns
 * metadata that the chat UI can render inline:
 *   - instanceId          → the Connection.id
 *   - qrCodeBase64        → QR payload (empty string until wired to uazapi)
 *   - shareLink           → /integracoes/compartilhar/<token> for remote onboard
 *   - expiresIn           → seconds until the share token expires
 *
 * Pattern mirrors `create-agent.tool.ts` (same context shape, same Prisma
 * singleton, same success / failure envelope).
 *
 * NOTE (flexibility clauses from the PRD):
 *   - QR code generation is left as a TODO stub: the real flow requires
 *     calling the existing uazapi broker from
 *     `src/server/communication/instances/*`. We cannot import that service
 *     from the builder module without creating a dependency cycle today, so
 *     we return an empty qrCodeBase64 and mark the site with a TODO so the
 *     frontend can poll the existing `/api/instances/:id/qr` endpoint.
 *   - Organization quota enforcement (Organization.maxInstances) is also
 *     left as a TODO — the field does not appear on the current schema.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'

// ---------------------------------------------------------------------------
// Context (shared shape with the other builder tools)
// ---------------------------------------------------------------------------

export interface BuilderToolExecutionContext {
  /** BuilderProject.id that owns the conversation */
  projectId: string
  /** Organization.id (tenant boundary) */
  organizationId: string
  /** User.id of the Builder chat author */
  userId: string
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

type CreateInstanceResult =
  | {
      success: true
      instanceId: string
      qrCodeBase64: string
      shareLink: string
      expiresIn: number
      message: string
    }
  | { success: false; message: string }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Share token lifetime in seconds — matches the share controller default. */
const SHARE_TOKEN_TTL_SECONDS = 15 * 60 // 15 minutes

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createInstanceTool(ctx: BuilderToolExecutionContext) {
  return tool({
    description:
      'Creates a new WhatsApp instance (Connection) in the current organization and returns a QR code and a share link so the user can pair their WhatsApp. Call this ONLY AFTER the user confirms they want a new WhatsApp number connected. After calling, tell the user to scan the QR code or open the share link on their phone.',
    inputSchema: z.object({
      name: z
        .string()
        .min(2)
        .max(100)
        .describe(
          'Friendly name for the instance, e.g. "Silva Advocacia WA". Shown in the UI.',
        ),
      broker: z
        .enum(['uazapi', 'cloudapi'])
        .default('uazapi')
        .describe(
          'Which WhatsApp provider to use. "uazapi" = unofficial WhatsApp Web (QR pairing). "cloudapi" = official Meta Cloud API.',
        ),
    }),
    execute: async (input): Promise<CreateInstanceResult> => {
      try {
        // TODO: enforce Organization.maxInstances quota once the field exists
        // on the schema. For now we only verify the org exists.
        const org = await database.organization.findUnique({
          where: { id: ctx.organizationId },
          select: { id: true },
        })

        if (!org) {
          return {
            success: false,
            message: `Organization ${ctx.organizationId} not found`,
          }
        }

        // Map broker → Prisma Provider enum value.
        const provider =
          input.broker === 'cloudapi' ? 'WHATSAPP_CLOUD_API' : 'WHATSAPP_WEB'

        // Generate share token using the same format as
        // `instances.controller.ts` so the public `/integracoes/compartilhar/`
        // route can resolve it out of the box.
        const shareToken = `share_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 11)}`
        const shareTokenExpiresAt = new Date(
          Date.now() + SHARE_TOKEN_TTL_SECONDS * 1000,
        )

        const connection = await database.connection.create({
          data: {
            name: input.name,
            channel: 'WHATSAPP',
            provider,
            status: 'DISCONNECTED',
            organizationId: ctx.organizationId,
            shareToken,
            shareTokenExpiresAt,
          },
          select: { id: true, name: true },
        })

        // TODO: wire to existing QR service — the uazapi broker living in
        // `src/server/communication/instances/*` is the source of truth for
        // QR generation. Importing it from this module would create a cycle
        // between ai-module and communication, so we return an empty string
        // here and let the frontend poll the existing GET /api/instances/:id
        // endpoint (which already exposes the qrCode field) once the
        // backend has populated it.
        const qrCodeBase64 = ''

        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
        const shareLink = `${baseUrl}/integracoes/compartilhar/${shareToken}`

        return {
          success: true,
          instanceId: connection.id,
          qrCodeBase64,
          shareLink,
          expiresIn: SHARE_TOKEN_TTL_SECONDS,
          message: `WhatsApp instance '${connection.name}' created. Ask the user to scan the QR code, or open the share link on their phone to pair remotely.`,
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to create WhatsApp instance'
        return { success: false, message }
      }
    },
  })
}
