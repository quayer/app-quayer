/**
 * Builder Refresh-QR — porta mecânica para oRPC (lote B4 do builder).
 *
 * Origem: ./refresh-qr.routes.ts (1 action).
 *   refreshQr POST /builder/channel/refresh-qr
 *
 * NOTA 502: o original responde `response.status(502).json({error})` quando o
 * broker falha — aqui vira ORPCError('BAD_GATEWAY') (status 502 preservado;
 * corpo no shape oRPC — delta aceito).
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { getDatabase } from '@/server/services/database'
import { uazapiService } from '@/lib/api/uazapi.service'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const authed = base.use(authOrApiKey)

const SHARE_TOKEN_TTL_MS = 15 * 60 * 1000

// ==========================================
// REFRESH QR — POST /builder/channel/refresh-qr
// ==========================================
export const refreshQr = authed
  .route({
    method: 'POST',
    path: '/builder/channel/refresh-qr',
    summary: 'Refresh WhatsApp QR Code',
  })
  .input(z.object({ connectionId: z.string().uuid('connectionId inválido') }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const db = getDatabase()

    // Connection SEMPRE resolvida org-scoped: connectionId de outra org → 404.
    const connection = await db.connection.findFirst({
      where: { id: input.connectionId, organizationId: orgId },
      select: { id: true, uazapiToken: true },
    })
    if (!connection) throw new ORPCError('NOT_FOUND', { message: 'Conexão não encontrada' })

    if (!connection.uazapiToken) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Esta conexão não possui token UAZapi para gerar QR Code real.',
      })
    }

    const qrResult = await uazapiService.generateQR(connection.uazapiToken)
    if (!qrResult.success || !qrResult.data?.qrcode) {
      throw new ORPCError('BAD_GATEWAY', {
        message: qrResult.error ?? 'Erro ao gerar QR Code',
      })
    }

    const shareTokenExpiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_MS)
    const updated = await db.connection.update({
      where: { id: connection.id },
      data: {
        qrCode: qrResult.data.qrcode,
        shareTokenExpiresAt,
      },
      select: { qrCode: true, shareTokenExpiresAt: true },
    })

    return ok({
      qrCode: updated.qrCode,
      shareTokenExpiresAt: updated.shareTokenExpiresAt?.toISOString() ?? null,
    })
  })

export const refreshQrActions = { refreshQr }
