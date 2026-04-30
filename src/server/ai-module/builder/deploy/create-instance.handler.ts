/**
 * createDeployInstance handler — step 2 of the Builder deploy saga.
 *
 * Creates (or reuses) a WhatsApp Connection row for the organization. This is
 * the same logic as `tools/create-instance.tool.ts` but stripped of the LLM
 * tool wrapper — we DO NOT modify the tool file; this handler exists so the
 * saga (and any future non-LLM deploy trigger) can reuse the logic.
 *
 * Touches tables:
 *   - Connection (INSERT)   — one row per deployment instance
 *   - BuilderDeployment (UPDATE instanceId) — wrapped in try/catch, see below
 *
 * Coupling with communication/:
 *   - Writes directly to `database.connection` because a dedicated
 *     `instanceService` is not exported under
 *     `@/server/communication/instances/services/instance.service`.
 *     When that service lands, swap the `database.connection.create` call
 *     for `instanceService.create(...)` to centralize validation + events.
 *   - Depends on `uazapiService` from `@/lib/api/uazapi.service`.
 *
 * Idempotent: if context.state.instanceId is already set (from a prior
 * attempt persisted to BuilderDeployment), the handler short-circuits.
 */

import { database } from '@/server/services/database'
import { uazapiService } from '@/lib/api/uazapi.service'
import type { DeployContext } from './deploy.contract'

export interface CreateDeployInstanceResult {
  instanceId: string
  qrCodeBase64: string
  shareLink: string
  reused: boolean
}

const SHARE_TOKEN_TTL_SECONDS = 15 * 60

export async function createDeployInstance(
  context: DeployContext,
): Promise<CreateDeployInstanceResult> {
  // Idempotency — if a previous attempt already created the Connection and
  // persisted the id on BuilderDeployment, skip re-creation.
  if (context.state.instanceId) {
    const existing = await database.connection.findFirst({
      where: {
        id: context.state.instanceId,
        organizationId: context.organizationId,
      },
      select: { id: true, shareToken: true },
    })
    if (existing) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      return {
        instanceId: existing.id,
        qrCodeBase64: '',
        shareLink: `${baseUrl}/compartilhar/${existing.shareToken ?? ''}`,
        reused: true,
      }
    }
  }

  // Use a derived instance name from the BuilderProject.
  const project = await database.builderProject.findFirst({
    where: { id: context.projectId, organizationId: context.organizationId },
    select: { name: true },
  })

  if (!project) {
    throw new Error(
      `Projeto ${context.projectId} não encontrado ao criar instância`,
    )
  }

  const instanceName = project.name.slice(0, 100) || 'Builder Instance'

  // Provision remote UAZapi instance first so we can persist the token.
  const uazapiResult = await uazapiService.createInstance(instanceName)
  if (
    !uazapiResult.success ||
    !uazapiResult.data ||
    !uazapiResult.data.token
  ) {
    throw new Error(
      uazapiResult.error ||
        'Falha ao provisionar instância WhatsApp no broker UAZapi',
    )
  }

  const uazapiToken = uazapiResult.data.token as string
  const uazapiInstanceId =
    (uazapiResult.data.instance?.id as string | undefined) ?? null

  const shareToken = `share_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 11)}`
  const shareTokenExpiresAt = new Date(
    Date.now() + SHARE_TOKEN_TTL_SECONDS * 1000,
  )

  const connection = await database.connection.create({
    data: {
      name: instanceName,
      channel: 'WHATSAPP',
      provider: 'WHATSAPP_WEB',
      status: 'DISCONNECTED',
      organizationId: context.organizationId,
      shareToken,
      shareTokenExpiresAt,
      uazapiToken,
      uazapiInstanceId,
    },
    select: { id: true, shareToken: true, uazapiToken: true },
  })

  // Best-effort QR generation — non-fatal.
  let qrCodeBase64 = ''
  if (connection.uazapiToken) {
    try {
      const qrResult = await uazapiService.generateQR(connection.uazapiToken)
      if (qrResult.success && qrResult.data?.qrcode) {
        qrCodeBase64 = qrResult.data.qrcode
      }
    } catch {
      qrCodeBase64 = ''
    }
  }

  context.state.instanceId = connection.id

  // Persist instanceId on BuilderDeployment — degrade gracefully if the
  // table doesn't exist yet.
  if (context.deploymentId) {
    try {
      await (database as unknown as {
        builderDeployment: {
          update: (args: {
            where: { id: string }
            data: Record<string, unknown>
          }) => Promise<unknown>
        }
      }).builderDeployment.update({
        where: { id: context.deploymentId },
        data: { instanceId: connection.id },
      })
    } catch (err) {
      console.warn(
        '[deploy/create-instance] BuilderDeployment.update failed — table may not exist yet:',
        err,
      )
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return {
    instanceId: connection.id,
    qrCodeBase64,
    shareLink: `${baseUrl}/compartilhar/${shareToken}`,
    reused: false,
  }
}

/**
 * Compensation: delete (archive) the Connection created in this step.
 * Best-effort — errors are swallowed by the rollback handler.
 */
export async function deleteDeployInstance(
  context: DeployContext,
): Promise<void> {
  if (!context.state.instanceId) return
  await database.connection.delete({
    where: { id: context.state.instanceId },
  })
}
