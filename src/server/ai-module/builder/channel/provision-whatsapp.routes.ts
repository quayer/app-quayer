/**
 * Provision WhatsApp Business (UAZAPI) — HTTP surface for the deploy-tab
 * "Conectar WhatsApp Business" flow.
 *
 *   POST /channel/provision-whatsapp  — provisiona instância UAZAPI, registra o
 *   webhook, cria a Connection (com shareToken) e anexa ao agente do projeto.
 *   Retorna { connectionId, shareToken, shareLink, qrCode } para o card.
 *
 * Espelha create-instance.handler (saga) mas sem DeployContext/BuilderDeployment
 * — é o caminho direto acionado pelo card de canais.
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import { uazapiService, buildUazapiWebhookUrl } from '@/lib/api/uazapi.service'
import { attachConnectionToProjectAgent } from './attach-to-agent'

type AuthedUser = { id: string; currentOrgId?: string | null }

const SHARE_TOKEN_TTL_SECONDS = 15 * 60

const provisionWhatsApp = igniter.mutation({
  name: 'Provision WhatsApp Business Instance',
  description:
    'Provisiona uma instância UAZAPI para o projeto (cria instância + webhook + Connection + QR) e anexa ao agente.',
  path: '/channel/provision-whatsapp',
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: z.object({ projectId: z.string().uuid('projectId inválido') }),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const { projectId } = request.body
    const db = getDatabase()

    const project = await db.builderProject.findFirst({
      where: { id: projectId, organizationId: user.currentOrgId },
      select: { id: true, name: true },
    })
    if (!project) return response.notFound('Projeto não encontrado')

    const instanceName = project.name.slice(0, 100) || 'WhatsApp Business'

    // 1) Provisiona a instância remota no broker UAZAPI.
    const created = await uazapiService.createInstance(instanceName)
    if (!created.success || !created.data?.token) {
      return response.badRequest(
        created.error || 'Falha ao provisionar instância WhatsApp no broker UAZAPI',
      )
    }
    const uazapiToken = created.data.token
    const uazapiInstanceId = (created.data.instance?.id as string | undefined) ?? null

    // 2) Registra o webhook inbound (best-effort — não aborta o fluxo).
    const webhookUrl = buildUazapiWebhookUrl()
    if (webhookUrl) {
      try {
        await uazapiService.setWebhook(uazapiToken, webhookUrl)
      } catch (err) {
        console.warn('[provision-whatsapp] setWebhook falhou (não-fatal):', err)
      }
    } else {
      console.warn(
        '[provision-whatsapp] NEXT_PUBLIC_APP_URL/UAZAPI_WEBHOOK_SECRET ausentes — webhook não registrado',
      )
    }

    const shareToken = `share_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    const shareTokenExpiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_SECONDS * 1000)

    // 3) Persiste a Connection vinculada ao projeto.
    const connection = await db.connection.create({
      data: {
        name: instanceName,
        channel: 'WHATSAPP',
        provider: 'WHATSAPP_WEB',
        status: 'DISCONNECTED',
        organizationId: user.currentOrgId,
        projectId: project.id,
        shareToken,
        shareTokenExpiresAt,
        uazapiToken,
        uazapiInstanceId,
      },
      select: { id: true, shareToken: true, uazapiToken: true },
    })

    // 4) Gera o QR (best-effort).
    let qrCode: string | null = null
    if (connection.uazapiToken) {
      try {
        const qr = await uazapiService.generateQR(connection.uazapiToken)
        if (qr.success && qr.data?.qrcode) qrCode = qr.data.qrcode
      } catch {
        qrCode = null
      }
    }

    // 5) Anexa a Connection ao agente do projeto (AgentDeployment ACTIVE).
    try {
      await attachConnectionToProjectAgent(db, project.id, connection.id, user.currentOrgId)
    } catch (err) {
      console.warn('[provision-whatsapp] attach ao agente falhou (não-fatal):', err)
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')

    return response.success({
      connectionId: connection.id,
      shareToken: connection.shareToken,
      shareLink: `${appUrl}/compartilhar/${connection.shareToken}`,
      qrCode,
    })
  },
})

export const provisionWhatsAppRoutes = { provisionWhatsApp }
