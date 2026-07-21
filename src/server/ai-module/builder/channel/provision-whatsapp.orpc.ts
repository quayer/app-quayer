/**
 * Builder Provision-WhatsApp — porta mecânica para oRPC (lote B4 do builder).
 *
 * Origem: ./provision-whatsapp.routes.ts (1 action).
 *   provisionWhatsApp POST /builder/channel/provision-whatsapp
 *
 * Idempotência preservada: sem force, reusa a Connection WHATSAPP_WEB já
 * provisionada (renova shareToken só quando expirado, estende TTL, regenera
 * QR, re-anexa). Helpers route-local copiados 1:1.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { getDatabase } from '@/server/services/database'
import { uazapiService, buildUazapiWebhookUrl } from '@/lib/api/uazapi.service'
import { attachConnectionToProjectAgent } from './attach-to-agent'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const authed = base.use(authOrApiKey)

const SHARE_TOKEN_TTL_SECONDS = 15 * 60

function newShareToken(): string {
  return `share_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function shareLinkFor(token: string | null): string | null {
  if (!token) return null
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return `${appUrl}/compartilhar/${token}`
}

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

async function generateQrSafe(uazapiToken: string): Promise<string | null> {
  try {
    const qr = await uazapiService.generateQR(uazapiToken)
    return qr.success && qr.data?.qrcode ? qr.data.qrcode : null
  } catch {
    return null
  }
}

// ==========================================
// PROVISION — POST /builder/channel/provision-whatsapp
// ==========================================
export const provisionWhatsApp = authed
  .route({
    method: 'POST',
    path: '/builder/channel/provision-whatsapp',
    summary: 'Provision WhatsApp Business Instance',
  })
  .input(
    z.object({
      projectId: z.string().uuid('projectId inválido'),
      force: z.boolean().optional().default(false),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const { projectId, force } = input
    const db = getDatabase()

    const project = await db.builderProject.findFirst({
      where: { id: projectId, organizationId: orgId },
      select: { id: true, name: true, aiAgentId: true },
    })
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    const instanceName = project.name.slice(0, 100) || 'WhatsApp Business'

    // 0) Idempotência: reusa a Connection WHATSAPP_WEB já provisionada.
    if (!force && project.aiAgentId) {
      const deployment = await db.agentDeployment.findFirst({
        where: {
          agentConfigId: project.aiAgentId,
          connection: {
            organizationId: orgId,
            channel: 'WHATSAPP',
            provider: 'WHATSAPP_WEB',
          },
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          connection: {
            select: {
              id: true,
              status: true,
              shareToken: true,
              shareTokenExpiresAt: true,
              uazapiToken: true,
            },
          },
        },
      })
      const existing = deployment?.connection ?? null

      if (existing) {
        // Já conectada — nada a provisionar; devolve a existente sem mexer no QR.
        if (existing.status === 'CONNECTED') {
          return ok({
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
          if (!broker.ok) throw new ORPCError('BAD_REQUEST', { message: broker.error })
          uazapiToken = broker.token
          newBrokerInstanceId = broker.instanceId
        }

        const tokenStillValid =
          existing.shareToken !== null &&
          existing.shareTokenExpiresAt !== null &&
          existing.shareTokenExpiresAt.getTime() > Date.now()
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
          await attachConnectionToProjectAgent(db, project.id, existing.id, orgId)
        } catch (err) {
          console.warn('[provision-whatsapp] attach ao agente falhou (não-fatal):', err)
        }

        return ok({
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
    if (!broker.ok) throw new ORPCError('BAD_REQUEST', { message: broker.error })

    const shareToken = newShareToken()
    const shareTokenExpiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_SECONDS * 1000)

    // 2) Gera o QR (best-effort) ANTES do insert para persistir na Connection.
    const qrCode = await generateQrSafe(broker.token)

    // 3) Persiste a Connection (SEM projectId — FK aponta para a tabela legada).
    const connection = await db.connection.create({
      data: {
        name: instanceName,
        channel: 'WHATSAPP',
        provider: 'WHATSAPP_WEB',
        status: 'DISCONNECTED',
        organizationId: orgId,
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
      await attachConnectionToProjectAgent(db, project.id, connection.id, orgId)
    } catch (err) {
      console.warn('[provision-whatsapp] attach ao agente falhou (não-fatal):', err)
    }

    return ok({
      connectionId: connection.id,
      reused: false,
      connected: false,
      shareToken: connection.shareToken,
      shareLink: shareLinkFor(connection.shareToken),
      qrCode,
      shareTokenExpiresAt: shareTokenExpiresAt.toISOString(),
    })
  })

export const provisionWhatsAppActions = { provisionWhatsApp }
