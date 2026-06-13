/**
 * Channel Credentials — HTTP surface for Cloud API / Instagram BYOK.
 *
 * Exposes 2 actions (composed into the builder controller by the orchestrator):
 *   POST /channel/credentials               — save (create/update) credentials
 *   GET  /channel/credentials/:connectionId — masked status (configured + last4)
 *
 * Security: secret Connection columns are AES-encrypted via lib/crypto before
 * the db write (mirrors core/providers BYOK); GET only returns a `last4` hint.
 * Every query is scoped to organizationId (currentOrgId). Pure validation +
 * mapping lives in ./channel-credentials.contract; crypto in ./*.crypto.
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import {
  saveChannelCredentialsSchema,
  toConnectionData,
} from './channel-credentials.contract'
import { encryptSecretColumns, lastFour } from './channel-credentials.crypto'
import { attachConnectionToProjectAgent } from './attach-to-agent'

// ---------------------------------------------------------------------------
// Types & schemas
// ---------------------------------------------------------------------------

type AuthedUser = {
  id: string
  currentOrgId?: string | null
  role?: string | null
}

/**
 * Envelope fields the ROUTE owns (the contract mapper omits these): which
 * Connection to write to + scoping metadata. Intersected with the
 * discriminated credential union so the body stays a single Zod schema.
 */
const envelopeSchema = z.object({
  /** Target Connection to update; omit to create a new one. */
  connectionId: z.string().uuid('connectionId inválido').optional(),
  /**
   * BuilderProject to link through AgentDeployment. Do not write it to
   * Connection.projectId: that FK points at the legacy Project table.
   */
  projectId: z.string().uuid('projectId inválido').optional(),
  /** Optional human label for a newly-created Connection. */
  name: z.string().trim().min(1).max(120).optional(),
})

const saveBodySchema = saveChannelCredentialsSchema.and(envelopeSchema)

/**
 * Manual Meta credentials are the connection proof for Cloud API / Instagram.
 * QR-based WhatsApp stays on provision-whatsapp and is promoted by webhook scan.
 */
const MANUAL_CREDENTIAL_STATUS = 'CONNECTED' as const

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const save = igniter.mutation({
  name: 'Save Channel Credentials',
  description:
    'Salva (cria/atualiza) credenciais Cloud API ou Instagram numa Connection, encriptando os tokens sensíveis.',
  path: '/channel/credentials',
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: saveBodySchema,
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const body = request.body
    const { connectionId, projectId, name } = body
    const kind = body.kind

    // Pure plaintext mapping → then encrypt secret columns before persist.
    const plaintext = toConnectionData(body)
    const columns = encryptSecretColumns(plaintext, kind)

    const database = getDatabase()

    try {
      // UPDATE path — connection must exist AND belong to the active org.
      if (connectionId) {
        const existing = await database.connection.findFirst({
          where: { id: connectionId, organizationId: user.currentOrgId },
          select: { id: true },
        })
        if (!existing) {
          return response.notFound('Canal não encontrado ou não pertence à sua organização')
        }

        const updated = await database.connection.update({
          where: { id: existing.id },
          data: {
            ...columns,
            status: MANUAL_CREDENTIAL_STATUS,
            updatedAt: new Date(),
          },
          select: { id: true, name: true, provider: true, channel: true, status: true },
        })

        if (projectId) {
          await attachConnectionToProjectAgent(database, projectId, updated.id, user.currentOrgId)
        }

        return response.success({
          connectionId: updated.id,
          name: updated.name,
          provider: updated.provider,
          channel: updated.channel,
          status: updated.status,
          created: false,
        })
      }

      // CREATE path — route owns scoping/label fields the mapper omits.
      const created = await database.connection.create({
        data: {
          ...columns,
          organizationId: user.currentOrgId,
          name: name ?? `${kind} channel`,
          status: MANUAL_CREDENTIAL_STATUS,
        } as never,
        select: { id: true, name: true, provider: true, channel: true, status: true },
      })

      if (projectId) {
        await attachConnectionToProjectAgent(database, projectId, created.id, user.currentOrgId)
      }

      return response.success({
        connectionId: created.id,
        name: created.name,
        provider: created.provider,
        channel: created.channel,
        status: created.status,
        created: true,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[channel/credentials:save] Falha:', err)
      return response.badRequest(`Erro ao salvar credenciais: ${message}`)
    }
  },
})

const getStatus = igniter.query({
  name: 'Get Channel Credentials Status',
  description:
    'Retorna o status de configuração das credenciais (configurado + last4), nunca o token cru.',
  path: '/channel/credentials/:connectionId' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { connectionId?: string }
    const connectionId = params.connectionId
    if (!connectionId) return response.badRequest('connectionId obrigatório')

    const database = getDatabase()
    const conn = await database.connection.findFirst({
      where: { id: connectionId, organizationId: user.currentOrgId },
      select: {
        id: true,
        name: true,
        provider: true,
        channel: true,
        status: true,
        cloudApiPhoneNumberId: true,
        cloudApiWabaId: true,
        cloudApiVerifiedName: true,
        cloudApiAccessToken: true,
        cloudApiVerifyToken: true,
        igAccountId: true,
        igPageAccessToken: true,
        igAppSecret: true,
        igVerifyToken: true,
      },
    })

    if (!conn) {
      return response.notFound('Canal não encontrado ou não pertence à sua organização')
    }

    const isInstagram = conn.channel === 'INSTAGRAM'

    return response.success({
      connectionId: conn.id,
      name: conn.name,
      provider: conn.provider,
      channel: conn.channel,
      status: conn.status,
      // Non-secret passthrough hints.
      phoneNumberId: conn.cloudApiPhoneNumberId,
      wabaId: conn.cloudApiWabaId,
      verifiedName: conn.cloudApiVerifiedName,
      igAccountId: conn.igAccountId,
      // Secret fields: report configured + last4 only, never the raw token.
      secrets: isInstagram
        ? {
            pageAccessToken: { configured: !!conn.igPageAccessToken, last4: lastFour(conn.igPageAccessToken) },
            appSecret: { configured: !!conn.igAppSecret, last4: lastFour(conn.igAppSecret) },
            verifyToken: { configured: !!conn.igVerifyToken, last4: lastFour(conn.igVerifyToken) },
          }
        : {
            accessToken: { configured: !!conn.cloudApiAccessToken, last4: lastFour(conn.cloudApiAccessToken) },
            verifyToken: { configured: !!conn.cloudApiVerifyToken, last4: lastFour(conn.cloudApiVerifyToken) },
          },
    })
  },
})

export const channelCredentialsRoutes = { save, getStatus }
