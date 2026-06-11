/**
 * Provision WhatsApp Business (UAZAPI) — HTTP surface for the deploy-tab
 * "Conectar WhatsApp Business" flow.
 *
 *   POST /channel/provision-whatsapp  — provisiona instância UAZAPI, registra o
 *   webhook, cria a Connection (com shareToken) e anexa ao agente do projeto.
 *   Retorna { connectionId, shareToken, shareLink, qrCode, shareTokenExpiresAt }.
 *
 * IDEMPOTENTE: se o projeto já tem uma Connection WHATSAPP_WEB, a rota REUSA a
 * existente — renova o shareToken (apenas quando expirado), estende o TTL,
 * regenera o QR e re-anexa ao agente — em vez de acumular instâncias órfãs no
 * broker a cada clique. Por isso também serve de rota autenticada de "Gerar
 * novo QR" para o Builder. Criar uma instância nova exige `force: true`.
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

function newShareToken(): string {
  return `share_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function shareLinkFor(token: string | null): string | null {
  if (!token) return null
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return `${appUrl}/compartilhar/${token}`
}

/**
 * Provisiona a instância remota no broker UAZAPI e registra o webhook inbound
 * (best-effort — falha de webhook não aborta o fluxo).
 */
async function createBrokerInstance(
  instanceName: string,
): Promise<
  | { ok: true; token: string; instanceId: string | null }
  | { ok: false; error: string }
> {
  const created = await uazapiService.createInstance(instanceName)
  if (!created.success || !created.data?.token) {
    return {
      ok: false,
      error: created.error || 'Falha ao provisionar instância WhatsApp no broker UAZAPI',
    }
  }

  const webhookUrl = buildUazapiWebhookUrl()
  if (webhookUrl) {
    try {
      await uazapiService.setWebhook(created.data.token, webhookUrl)
    } catch (err) {
      console.warn('[provision-whatsapp] setWebhook falhou (não-fatal):', err)
    }
  } else {
    console.warn(
      '[provision-whatsapp] NEXT_PUBLIC_APP_URL/UAZAPI_WEBHOOK_SECRET ausentes — webhook não registrado',
    )
  }

  return {
    ok: true,
    token: created.data.token,
    instanceId: (created.data.instance?.id as string | undefined) ?? null,
  }
}

/** Gera o QR no broker (best-effort — null quando o broker falha). */
async function generateQrSafe(uazapiToken: string): Promise<string | null> {
  try {
    const qr = await uazapiService.generateQR(uazapiToken)
    return qr.success && qr.data?.qrcode ? qr.data.qrcode : null
  } catch {
    return null
  }
}

const provisionWhatsApp = igniter.mutation({
  name: 'Provision WhatsApp Business Instance',
  description:
    'Provisiona (ou reusa, idempotente) uma instância UAZAPI para o projeto ' +
    '(instância + webhook + Connection + QR) e anexa ao agente. force=true cria uma nova.',
  path: '/channel/provision-whatsapp',
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: z.object({
    projectId: z.string().uuid('projectId inválido'),
    /** Cria instância/Connection NOVAS mesmo quando já existe uma para o projeto. */
    force: z.boolean().optional().default(false),
  }),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const { projectId, force } = request.body
    const db = getDatabase()

    const project = await db.builderProject.findFirst({
      where: { id: projectId, organizationId: user.currentOrgId },
      select: { id: true, name: true },
    })
    if (!project) return response.notFound('Projeto não encontrado')

    const instanceName = project.name.slice(0, 100) || 'WhatsApp Business'

    // 0) Idempotência: reusa a Connection WHATSAPP_WEB já provisionada para o
    //    projeto (ativa OU pendente) em vez de criar instância/Connection novas.
    if (!force) {
      const existing = await db.connection.findFirst({
        where: {
          projectId: project.id,
          organizationId: user.currentOrgId,
          channel: 'WHATSAPP',
          provider: 'WHATSAPP_WEB',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          shareToken: true,
          shareTokenExpiresAt: true,
          uazapiToken: true,
        },
      })

      if (existing) {
        // Já conectada — nada a provisionar; devolve a existente sem mexer no QR.
        if (existing.status === 'CONNECTED') {
          return response.success({
            connectionId: existing.id,
            reused: true,
            connected: true,
            shareToken: existing.shareToken,
            shareLink: shareLinkFor(existing.shareToken),
            qrCode: null,
            shareTokenExpiresAt: existing.shareTokenExpiresAt?.toISOString() ?? null,
          })
        }

        // Pendente — garante token do broker, renova share/QR e re-anexa.
        let uazapiToken = existing.uazapiToken
        let newBrokerInstanceId: string | null = null
        if (!uazapiToken) {
          const broker = await createBrokerInstance(instanceName)
          if (!broker.ok) return response.badRequest(broker.error)
          uazapiToken = broker.token
          newBrokerInstanceId = broker.instanceId
        }

        const tokenStillValid =
          existing.shareToken !== null &&
          existing.shareTokenExpiresAt !== null &&
          existing.shareTokenExpiresAt.getTime() > Date.now()
        // Token válido é PRESERVADO (links já compartilhados continuam vivos);
        // só o TTL é estendido. Token expirado/ausente ganha um novo.
        const shareToken =
          tokenStillValid && existing.shareToken ? existing.shareToken : newShareToken()
        const shareTokenExpiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_SECONDS * 1000)

        const qrCode = await generateQrSafe(uazapiToken)

        await db.connection.update({
          where: { id: existing.id },
          data: {
            shareToken,
            shareTokenExpiresAt,
            qrCode: qrCode ?? undefined,
            uazapiToken: uazapiToken ?? undefined,
            uazapiInstanceId: newBrokerInstanceId ?? undefined,
          },
        })

        try {
          await attachConnectionToProjectAgent(db, project.id, existing.id, user.currentOrgId)
        } catch (err) {
          console.warn('[provision-whatsapp] attach ao agente falhou (não-fatal):', err)
        }

        return response.success({
          connectionId: existing.id,
          reused: true,
          connected: false,
          shareToken,
          shareLink: shareLinkFor(shareToken),
          qrCode,
          shareTokenExpiresAt: shareTokenExpiresAt.toISOString(),
        })
      }
    }

    // 1) Provisiona a instância remota no broker UAZAPI (+ webhook).
    const broker = await createBrokerInstance(instanceName)
    if (!broker.ok) return response.badRequest(broker.error)

    const shareToken = newShareToken()
    const shareTokenExpiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_SECONDS * 1000)

    // 2) Gera o QR (best-effort) ANTES do insert para persistir na Connection
    //    — a página /compartilhar lê o QR direto da row.
    const qrCode = await generateQrSafe(broker.token)

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
        uazapiToken: broker.token,
        uazapiInstanceId: broker.instanceId,
        qrCode,
      },
      select: { id: true, shareToken: true },
    })

    // 4) Anexa a Connection ao agente do projeto (AgentDeployment ACTIVE).
    try {
      await attachConnectionToProjectAgent(db, project.id, connection.id, user.currentOrgId)
    } catch (err) {
      console.warn('[provision-whatsapp] attach ao agente falhou (não-fatal):', err)
    }

    return response.success({
      connectionId: connection.id,
      reused: false,
      connected: false,
      shareToken: connection.shareToken,
      shareLink: shareLinkFor(connection.shareToken),
      qrCode,
      shareTokenExpiresAt: shareTokenExpiresAt.toISOString(),
    })
  },
})

export const provisionWhatsAppRoutes = { provisionWhatsApp }
