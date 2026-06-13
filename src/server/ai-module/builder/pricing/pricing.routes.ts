/**
 * Pricing routes — catálogo de preços do projeto (fonte da tool get_pricing).
 *
 *   GET    /pricing/:projectId             — lista + itens + status
 *   POST   /pricing/:projectId/list        — cria/garante a lista e liga ao agente
 *   POST   /pricing/:projectId/item        — adiciona item (price em reais)
 *   DELETE /pricing/:projectId/item/:itemId — remove item
 *
 * Lista é org-scoped (unique org+name); por projeto usamos name `pricing:${id}`
 * e setamos AIAgentConfig.priceListId. Google Sheets sync = fase 2.
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import { invalidateProjectRefinement } from '../refinement/refinement-state'

type AuthedUser = { id: string; currentOrgId?: string | null }

async function loadProject(projectId: string, organizationId: string) {
  return getDatabase().builderProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, aiAgentId: true },
  })
}

/** Cria (idempotente) a lista do projeto e liga ao agente. Retorna o id. */
async function ensureListId(
  project: { id: string; aiAgentId: string | null },
  organizationId: string,
): Promise<string> {
  const db = getDatabase()
  if (project.aiAgentId) {
    const agent = await db.aIAgentConfig.findUnique({
      where: { id: project.aiAgentId },
      select: { priceListId: true },
    })
    if (agent?.priceListId) return agent.priceListId
  }
  const list = await db.priceList.upsert({
    where: { organizationId_name: { organizationId, name: `pricing:${project.id}` } },
    create: { organizationId, name: `pricing:${project.id}`, description: 'Catálogo do projeto' },
    update: { isActive: true },
    select: { id: true },
  })
  if (project.aiAgentId) {
    await db.aIAgentConfig.update({
      where: { id: project.aiAgentId },
      data: { priceListId: list.id },
    })
  }
  return list.id
}

const getPricing = igniter.query({
  name: 'Get Pricing Catalog',
  description: 'Lista o catálogo de preços do projeto e seus itens.',
  path: '/pricing/:projectId' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')
    const params = request.params as { projectId?: string }
    if (!params.projectId) return response.badRequest('projectId obrigatório')

    const project = await loadProject(params.projectId, user.currentOrgId)
    if (!project) return response.notFound('Projeto não encontrado')

    const db = getDatabase()
    const list = await db.priceList.findFirst({
      where: { organizationId: user.currentOrgId, name: `pricing:${project.id}` },
      select: { id: true, name: true, currency: true, isActive: true },
    })
    if (!list) return response.success({ list: null, items: [] })

    const items = await db.priceItem.findMany({
      where: { priceListId: list.id },
      select: {
        id: true,
        name: true,
        priceCents: true,
        description: true,
        category: true,
        aliases: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    })
    return response.success({ list, items })
  },
})

const ensureList = igniter.mutation({
  name: 'Ensure Price List',
  description: 'Cria (idempotente) a lista de preços do projeto e a vincula ao agente.',
  path: '/pricing/:projectId/list' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: z.object({}).optional(),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')
    const params = request.params as { projectId?: string }
    if (!params.projectId) return response.badRequest('projectId obrigatório')

    const project = await loadProject(params.projectId, user.currentOrgId)
    if (!project) return response.notFound('Projeto não encontrado')

    const listId = await ensureListId(project, user.currentOrgId)
    await invalidateProjectRefinement({
      projectId: project.id,
      organizationId: user.currentOrgId,
      reason: 'A lista de preços foi vinculada depois do refinamento.',
    })
    return response.success({ listId })
  },
})

const addItem = igniter.mutation({
  name: 'Add Price Item',
  description: 'Adiciona um item ao catálogo (price em reais, convertido p/ centavos).',
  path: '/pricing/:projectId/item' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: z.object({
    name: z.string().min(1).max(160),
    price: z.number().min(0),
    description: z.string().max(500).optional(),
    category: z.string().max(80).optional(),
    aliases: z.array(z.string().max(80)).max(20).optional(),
  }),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')
    const params = request.params as { projectId?: string }
    if (!params.projectId) return response.badRequest('projectId obrigatório')

    const project = await loadProject(params.projectId, user.currentOrgId)
    if (!project) return response.notFound('Projeto não encontrado')

    const priceListId = await ensureListId(project, user.currentOrgId)
    const item = await getDatabase().priceItem.create({
      data: {
        priceListId,
        name: request.body.name,
        priceCents: Math.round(request.body.price * 100),
        description: request.body.description,
        category: request.body.category,
        aliases: (request.body.aliases ?? []).map((a) => a.toLowerCase()),
      },
      select: { id: true },
    })
    await invalidateProjectRefinement({
      projectId: project.id,
      organizationId: user.currentOrgId,
      reason: 'Um item de preço foi adicionado depois do refinamento.',
    })
    return response.success({ itemId: item.id })
  },
})

const deleteItem = igniter.mutation({
  name: 'Delete Price Item',
  description: 'Remove um item do catálogo (valida org).',
  path: '/pricing/:projectId/item/:itemId' as const,
  method: 'DELETE',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')
    const params = request.params as { projectId?: string; itemId?: string }
    if (!params.projectId || !params.itemId) return response.badRequest('params obrigatórios')

    const db = getDatabase()
    // Isolamento: item precisa pertencer a uma lista da org.
    const item = await db.priceItem.findFirst({
      where: { id: params.itemId, priceList: { organizationId: user.currentOrgId } },
      select: { id: true },
    })
    if (!item) return response.notFound('Item não encontrado')

    await db.priceItem.delete({ where: { id: item.id } })
    await invalidateProjectRefinement({
      projectId: params.projectId,
      organizationId: user.currentOrgId,
      reason: 'Um item de preço foi removido depois do refinamento.',
    })
    return response.success({ deleted: true })
  },
})

export const pricingRoutes = { getPricing, ensureList, addItem, deleteItem }
