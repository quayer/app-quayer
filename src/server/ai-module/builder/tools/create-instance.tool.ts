/**
 * Builder Tool — create_whatsapp_instance (US-012)
 *
 * Creates a new WhatsApp `Connection` for the current organization and returns
 * metadata that the chat UI can render inline:
 *   - instanceId          → the Connection.id
 *   - qrCodeBase64        → QR payload (empty string until wired to uazapi)
 *   - shareLink           → /compartilhar/<token> for remote onboard
 *   - expiresIn           → seconds until the share token expires
 *
 * Pattern mirrors `create-agent.tool.ts` (same context shape, same Prisma
 * singleton, same success / failure envelope).
 *
 * NOTE:
 *   - For provider `uazapi` (WHATSAPP_WEB) we call the UAZapi broker directly
 *     via `uazapiService` (defined in `src/lib/api/uazapi.service.ts`, which
 *     only imports a type from instances.interfaces — no cycle with the
 *     ai-module). We first provision the remote instance to obtain its
 *     token, persist it on the Connection, then generate the QR.
 *   - For provider `cloudapi` (WHATSAPP_CLOUD_API) QR pairing is not
 *     applicable — `qrCodeBase64` is returned as an empty string and the
 *     user is expected to finish credential setup elsewhere.
 *   - Organization quota enforcement (Organization.maxInstances) is left as
 *     a TODO — the field does not appear on the current Builder schema.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { uazapiService } from '@/lib/api/uazapi.service'
import { buildBuilderTool } from './build-tool'

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
  return buildBuilderTool({
    name: 'create_whatsapp_instance',
    metadata: { isReadOnly: false, isConcurrencySafe: false, requiresApproval: true },
    tool: tool({
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
        // `instances.controller.ts` so the public `/compartilhar/`
        // route can resolve it out of the box.
        const shareToken = `share_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 11)}`
        const shareTokenExpiresAt = new Date(
          Date.now() + SHARE_TOKEN_TTL_SECONDS * 1000,
        )

        // For the UAZapi (WhatsApp Web) broker we must provision a remote
        // instance BEFORE persisting the Connection so we can store the
        // instance token returned by UAZapi — this token is the only
        // credential that lets us later call `generateQR`.
        let uazapiToken: string | null = null
        let uazapiInstanceId: string | null = null
        if (input.broker === 'uazapi') {
          const uazapiResult = await uazapiService.createInstance(input.name)
          if (
            !uazapiResult.success ||
            !uazapiResult.data ||
            !uazapiResult.data.token
          ) {
            return {
              success: false,
              message:
                uazapiResult.error ||
                'Failed to provision WhatsApp instance on UAZapi broker',
            }
          }
          uazapiToken = uazapiResult.data.token as string
          uazapiInstanceId =
            (uazapiResult.data.instance?.id as string | undefined) ?? null
        }

        const connection = await database.connection.create({
          data: {
            name: input.name,
            channel: 'WHATSAPP',
            provider,
            status: 'DISCONNECTED',
            organizationId: ctx.organizationId,
            shareToken,
            shareTokenExpiresAt,
            uazapiToken,
            uazapiInstanceId,
          },
          select: { id: true, name: true, uazapiToken: true },
        })

        // Generate QR only for the UAZapi (WhatsApp Web) provider.
        // CloudAPI does not use QR pairing. Any failure here is non-fatal:
        // we still return the share link so the user has a fallback.
        let qrCodeBase64 = ''
        if (input.broker === 'uazapi' && connection.uazapiToken) {
          try {
            const qrResult = await uazapiService.generateQR(
              connection.uazapiToken,
            )
            if (qrResult.success && qrResult.data?.qrcode) {
              qrCodeBase64 = qrResult.data.qrcode
            }
          } catch {
            // Swallow — frontend can retry via GET /api/v1/instances/:id
            qrCodeBase64 = ''
          }
        }

        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
        const shareLink = `${baseUrl}/compartilhar/${shareToken}`

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
  }),
  })
}
