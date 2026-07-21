/**
 * Builder Channel-credentials — porta mecânica para oRPC (lote B4 do builder).
 *
 * Origem: ./channel-credentials.routes.ts (2 actions).
 *   save      POST /builder/channel/credentials
 *   getStatus GET  /builder/channel/credentials/:connectionId
 *
 * Segurança preservada: colunas secretas AES-encriptadas antes do write
 * (encryptSecretColumns); GET devolve apenas configured + last4, nunca o
 * token cru. Toda query org-scoped.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { getDatabase } from '@/server/services/database'
import {
  saveChannelCredentialsSchema,
  toConnectionData,
} from './channel-credentials.contract'
import { encryptSecretColumns, lastFour } from './channel-credentials.crypto'
import { attachConnectionToProjectAgent } from './attach-to-agent'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const authed = base.use(authOrApiKey)

// Envelope fields que a ROTA possui (o mapper do contract os omite) — cópia
// 1:1 de channel-credentials.routes.ts.
const envelopeSchema = z.object({
  connectionId: z.string().uuid('connectionId inválido').optional(),
  projectId: z.string().uuid('projectId inválido').optional(),
  name: z.string().trim().min(1).max(120).optional(),
})

const saveBodySchema = saveChannelCredentialsSchema.and(envelopeSchema)

const MANUAL_CREDENTIAL_STATUS = 'CONNECTED' as const

// ==========================================
// SAVE — POST /builder/channel/credentials
// ==========================================
export const save = authed
  .route({
    method: 'POST',
    path: '/builder/channel/credentials',
    summary: 'Save Channel Credentials',
  })
  .input(saveBodySchema)
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const { connectionId, projectId, name } = input
    const kind = input.kind

    // Mapping puro em plaintext → depois encripta as colunas secretas.
    const plaintext = toConnectionData(input)
    const columns = encryptSecretColumns(plaintext, kind)

    const database = getDatabase()

    try {
      // UPDATE path — a connection precisa existir E pertencer à org ativa.
      if (connectionId) {
        const existing = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
          select: { id: true },
        })
        if (!existing) {
          throw new ORPCError('NOT_FOUND', {
            message: 'Canal não encontrado ou não pertence à sua organização',
          })
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
          await attachConnectionToProjectAgent(database, projectId, updated.id, orgId)
        }

        return ok({
          connectionId: updated.id,
          name: updated.name,
          provider: updated.provider,
          channel: updated.channel,
          status: updated.status,
          created: false,
        })
      }

      // CREATE path — a rota possui os campos de scoping/label que o mapper omite.
      const created = await database.connection.create({
        data: {
          ...columns,
          organizationId: orgId,
          name: name ?? `${kind} channel`,
          status: MANUAL_CREDENTIAL_STATUS,
        } as never,
        select: { id: true, name: true, provider: true, channel: true, status: true },
      })

      if (projectId) {
        await attachConnectionToProjectAgent(database, projectId, created.id, orgId)
      }

      return ok({
        connectionId: created.id,
        name: created.name,
        provider: created.provider,
        channel: created.channel,
        status: created.status,
        created: true,
      })
    } catch (err) {
      if (err instanceof ORPCError) throw err
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[channel/credentials:save] Falha:', err)
      throw new ORPCError('BAD_REQUEST', {
        message: `Erro ao salvar credenciais: ${message}`,
      })
    }
  })

// ==========================================
// STATUS — GET /builder/channel/credentials/{connectionId}
// ==========================================
export const getStatus = authed
  .route({
    method: 'GET',
    path: '/builder/channel/credentials/{connectionId}',
    summary: 'Get Channel Credentials Status',
  })
  .input(z.object({ connectionId: z.string().min(1, 'connectionId obrigatório') }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const database = getDatabase()
    const conn = await database.connection.findFirst({
      where: { id: input.connectionId, organizationId: orgId },
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
      throw new ORPCError('NOT_FOUND', {
        message: 'Canal não encontrado ou não pertence à sua organização',
      })
    }

    const isInstagram = conn.channel === 'INSTAGRAM'

    return ok({
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
      // Campos secretos: apenas configured + last4, nunca o token cru.
      secrets: isInstagram
        ? {
            pageAccessToken: {
              configured: !!conn.igPageAccessToken,
              last4: lastFour(conn.igPageAccessToken),
            },
            appSecret: {
              configured: !!conn.igAppSecret,
              last4: lastFour(conn.igAppSecret),
            },
            verifyToken: {
              configured: !!conn.igVerifyToken,
              last4: lastFour(conn.igVerifyToken),
            },
          }
        : {
            accessToken: {
              configured: !!conn.cloudApiAccessToken,
              last4: lastFour(conn.cloudApiAccessToken),
            },
            verifyToken: {
              configured: !!conn.cloudApiVerifyToken,
              last4: lastFour(conn.cloudApiVerifyToken),
            },
          },
    })
  })

export const channelCredentialsActions = { save, getStatus }
