/**
 * Builder Projects/Channel — porta mecânica para oRPC (lote B1 do builder).
 *
 * Origem: ./channel.routes.ts (4 actions).
 * URLs: GET /builder/projects/:id/channel/options · GET|POST|DELETE
 *       /builder/projects/:id/channel
 * Fidelidade: posse por org em todas; attach valida a connection da org e
 * delega ao attachConnectionToProjectAgent; detach pausa deployments ativos.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { getDatabase } from '@/server/services/database'
import { attachConnectionToProjectAgent } from '../../channel/attach-to-agent'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from './crud.orpc'

const projectIdParam = { id: z.string().uuid('ID de projeto inválido') }
const authed = base.use(authOrApiKey)

// ==========================================
// OPTIONS — GET /builder/projects/{id}/channel/options
// ==========================================
export const listProjectChannelOptions = authed
  .route({
    method: 'GET',
    path: '/builder/projects/{id}/channel/options',
    summary: 'List Project Channel Options',
  })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const database = getDatabase()

    const project = await database.builderProject.findFirst({
      where: { id: input.id, organizationId: orgId },
      select: { id: true },
    })
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    const channels = await database.connection.findMany({
      where: { organizationId: orgId, channel: 'WHATSAPP' },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        status: true,
        provider: true,
        profileName: true,
      },
    })

    return ok({ channels })
  })

// ==========================================
// GET — GET /builder/projects/{id}/channel
// ==========================================
export const getProjectChannel = authed
  .route({
    method: 'GET',
    path: '/builder/projects/{id}/channel',
    summary: 'Get Project Channel',
  })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const database = getDatabase()

    const project = await database.builderProject.findFirst({
      where: { id: input.id, organizationId: orgId },
      select: { aiAgentId: true },
    })

    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })
    if (!project.aiAgentId) return ok({ channel: null })

    const deployment = await database.agentDeployment.findFirst({
      where: { agentConfigId: project.aiAgentId, status: 'ACTIVE' },
      include: {
        connection: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            status: true,
            channel: true,
            provider: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return ok({ channel: deployment?.connection ?? null })
  })

// ==========================================
// ATTACH — POST /builder/projects/{id}/channel
// ==========================================
export const attachChannel = authed
  .route({
    method: 'POST',
    path: '/builder/projects/{id}/channel',
    summary: 'Attach Channel to Project',
  })
  .input(
    z.object({ ...projectIdParam, connectionId: z.string().uuid('ID de canal inválido') }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const { id, connectionId } = input
    const database = getDatabase()

    const project = await database.builderProject.findFirst({
      where: { id, organizationId: orgId },
      select: { aiAgentId: true },
    })

    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })
    if (!project.aiAgentId) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'O Builder ainda não criou o agente para este projeto',
      })
    }

    const connection = await database.connection.findFirst({
      where: { id: connectionId, organizationId: orgId },
      select: { id: true, name: true, phoneNumber: true, status: true },
    })

    if (!connection) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Canal não encontrado ou não pertence à sua organização',
      })
    }

    await attachConnectionToProjectAgent(database, id, connectionId, orgId)

    return ok({ connectionId, name: connection.name })
  })

// ==========================================
// DETACH — DELETE /builder/projects/{id}/channel
// ==========================================
export const detachChannel = authed
  .route({
    method: 'DELETE',
    path: '/builder/projects/{id}/channel',
    summary: 'Detach Channel from Project',
  })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const database = getDatabase()

    const project = await database.builderProject.findFirst({
      where: { id: input.id, organizationId: orgId },
      select: { aiAgentId: true },
    })

    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })
    if (!project.aiAgentId) return ok({ detached: false })

    await database.agentDeployment.updateMany({
      where: { agentConfigId: project.aiAgentId, status: 'ACTIVE' },
      data: { status: 'PAUSED', updatedAt: new Date() },
    })

    return ok({ detached: true })
  })

export const channelActions = {
  listProjectChannelOptions,
  getProjectChannel,
  attachChannel,
  detachChannel,
}
