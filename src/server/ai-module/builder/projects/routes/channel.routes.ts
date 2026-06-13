/**
 * Builder Projects — Channel routes
 * Actions: getProjectChannel, attachChannel, detachChannel
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import { attachConnectionToProjectAgent } from '../../channel/attach-to-agent'

// ---------------------------------------------------------------------------
// Shared param schema (reuses the same shape as getProjectParamsSchema)
// ---------------------------------------------------------------------------

const channelProjectParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})

// ---------------------------------------------------------------------------
// Tipagem mínima do usuário autenticado — evita `any` espalhado.
// ---------------------------------------------------------------------------

type AuthedUser = {
  id: string
  currentOrgId?: string | null
  role?: string | null
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const channelRoutes = {
  // ==========================================
  // LIST PROJECT CHANNEL OPTIONS — GET /projects/:id/channel/options
  // ==========================================
  listProjectChannelOptions: igniter.query({
    name: 'List Project Channel Options',
    description: 'Lista canais WhatsApp existentes na organização para vincular ao projeto.',
    path: '/projects/:id/channel/options' as const,
    method: 'GET',
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = channelProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const database = getDatabase()
      const project = await database.builderProject.findFirst({
        where: { id, organizationId: user.currentOrgId },
        select: { id: true },
      })

      if (!project) return response.notFound('Projeto não encontrado')

      const channels = await database.connection.findMany({
        where: {
          organizationId: user.currentOrgId,
          channel: 'WHATSAPP',
        },
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

      return response.success({ channels })
    },
  }),

  // ==========================================
  // GET PROJECT CHANNEL — GET /projects/:id/channel
  // ==========================================
  getProjectChannel: igniter.query({
    name: 'Get Project Channel',
    description: 'Retorna o canal (Connection) ativo vinculado ao agente do projeto via AgentDeployment.',
    path: '/projects/:id/channel' as const,
    method: 'GET',
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = channelProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const database = getDatabase()
      const project = await database.builderProject.findFirst({
        where: { id, organizationId: user.currentOrgId },
        select: { aiAgentId: true },
      })

      if (!project) return response.notFound('Projeto não encontrado')
      if (!project.aiAgentId) return response.success({ channel: null })

      const deployment = await database.agentDeployment.findFirst({
        where: {
          agentConfigId: project.aiAgentId,
          status: 'ACTIVE',
        },
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

      return response.success({ channel: deployment?.connection ?? null })
    },
  }),

  // ==========================================
  // ATTACH CHANNEL — POST /projects/:id/channel
  // ==========================================
  attachChannel: igniter.mutation({
    name: 'Attach Channel to Project',
    description: 'Vincula um canal WhatsApp existente ao agente do projeto via AgentDeployment.',
    path: '/projects/:id/channel' as const,
    method: 'POST',
    use: [authOrApiKeyProcedure({ required: true })],
    body: z.object({ connectionId: z.string().uuid('ID de canal inválido') }),
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = channelProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data
      const { connectionId } = request.body

      const database = getDatabase()

      const project = await database.builderProject.findFirst({
        where: { id, organizationId: user.currentOrgId },
        select: { aiAgentId: true },
      })

      if (!project) return response.notFound('Projeto não encontrado')
      if (!project.aiAgentId) return response.badRequest('O Builder ainda não criou o agente para este projeto')

      // Validate connection belongs to org
      const connection = await database.connection.findFirst({
        where: { id: connectionId, organizationId: user.currentOrgId },
        select: { id: true, name: true, phoneNumber: true, status: true },
      })

      if (!connection) return response.notFound('Canal não encontrado ou não pertence à sua organização')

      await attachConnectionToProjectAgent(
        database,
        id,
        connectionId,
        user.currentOrgId,
      )

      return response.success({ connectionId, name: connection.name })
    },
  }),

  // ==========================================
  // DETACH CHANNEL — DELETE /projects/:id/channel
  // ==========================================
  detachChannel: igniter.mutation({
    name: 'Detach Channel from Project',
    description: 'Remove o vínculo entre o canal ativo e o agente do projeto.',
    path: '/projects/:id/channel' as const,
    method: 'DELETE',
    use: [authOrApiKeyProcedure({ required: true })],
    body: z.object({}).optional(),
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = channelProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const database = getDatabase()
      const project = await database.builderProject.findFirst({
        where: { id, organizationId: user.currentOrgId },
        select: { aiAgentId: true },
      })

      if (!project) return response.notFound('Projeto não encontrado')
      if (!project.aiAgentId) return response.success({ detached: false })

      await database.agentDeployment.updateMany({
        where: { agentConfigId: project.aiAgentId, status: 'ACTIVE' },
        data: { status: 'PAUSED', updatedAt: new Date() },
      })

      return response.success({ detached: true })
    },
  }),
}
