/**
 * Refresh QR (UAZAPI) — HTTP surface autenticado para o botão "Gerar novamente"
 * do card `whatsapp_connect` (Jornada v2, Onda 5).
 *
 *   POST /channel/refresh-qr  — regenera o QR de uma Connection EXISTENTE e
 *   renova o TTL do shareToken. Retorna { qrCode, shareTokenExpiresAt }.
 *
 * NÃO cria instância no broker nem linha Connection (o provisioning não é
 * idempotente — ver plan §3.6); espelha a lógica de
 * `POST /api/v1/instances/share/[token]/route.ts:69-117`, mas a Connection é
 * SEMPRE resolvida org-scoped (NFR-01) em vez de por shareToken público.
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import { uazapiService } from '@/lib/api/uazapi.service'

type AuthedUser = { id: string; currentOrgId?: string | null }

const SHARE_TOKEN_TTL_MS = 15 * 60 * 1000

const refreshQr = igniter.mutation({
  name: 'Refresh WhatsApp QR Code',
  description:
    'Regenera o QR de uma Connection existente (org-scoped) e renova o TTL do ' +
    'shareToken. NÃO cria instância nem Connection nova.',
  path: '/channel/refresh-qr',
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: z.object({
    connectionId: z.string().uuid('connectionId inválido'),
  }),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const { connectionId } = request.body
    const db = getDatabase()

    // Connection SEMPRE resolvida org-scoped: connectionId de outra org → 404.
    const connection = await db.connection.findFirst({
      where: { id: connectionId, organizationId: user.currentOrgId },
      select: { id: true, uazapiToken: true },
    })
    if (!connection) return response.notFound('Conexão não encontrada')

    if (!connection.uazapiToken) {
      return response.badRequest(
        'Esta conexão não possui token UAZapi para gerar QR Code real.',
      )
    }

    const qrResult = await uazapiService.generateQR(connection.uazapiToken)
    if (!qrResult.success || !qrResult.data?.qrcode) {
      return response
        .status(502)
        .json({ error: qrResult.error ?? 'Erro ao gerar QR Code' })
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

    return response.success({
      qrCode: updated.qrCode,
      shareTokenExpiresAt: updated.shareTokenExpiresAt?.toISOString() ?? null,
    })
  },
})

export const refreshQrRoutes = { refreshQr }
