/**
 * Builder Pricing — porta mecânica para oRPC (lote B5 do builder).
 *
 * Origem: ./pricing.routes.ts (4 actions).
 *   getPricing GET    /builder/pricing/:projectId
 *   ensureList POST   /builder/pricing/:projectId/list
 *   addItem    POST   /builder/pricing/:projectId/item
 *   deleteItem DELETE /builder/pricing/:projectId/item/:itemId
 *
 * ensureListId (upsert org+name `pricing:${id}` + vínculo ao agente) copiado
 * 1:1 (helper route-local no original).
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { getDatabase } from '@/server/services/database'
import { invalidateProjectRefinement } from '../refinement/refinement-state'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const projectIdParam = { projectId: z.string().min(1, 'projectId obrigatório') }
const authed = base.use(authOrApiKey)

async function loadProjectForOrg(
  projectId: string,
  organizationId: string,
): Promise<{ id: string; aiAgentId: string | null }> {
  const project = await getDatabase().builderProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, aiAgentId: true },
  })
  if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })
  return project
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
    create: {
      organizationId,
      name: `pricing:${project.id}`,
      description: 'Catálogo do projeto',
    },
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

// ==========================================
// GET — GET /builder/pricing/{projectId}
// ==========================================
export const getPricing = authed
  .route({
    method: 'GET',
    path: '/builder/pricing/{projectId}',
    summary: 'Get Pricing Catalog',
  })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const project = await loadProjectForOrg(input.projectId, orgId)

    const db = getDatabase()
    const list = await db.priceList.findFirst({
      where: { organizationId: orgId, name: `pricing:${project.id}` },
      select: { id: true, name: true, currency: true, isActive: true },
    })
    if (!list) return ok({ list: null, items: [] })

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
    return ok({ list, items })
  })

// ==========================================
// ENSURE LIST — POST /builder/pricing/{projectId}/list
// ==========================================
export const ensureList = authed
  .route({
    method: 'POST',
    path: '/builder/pricing/{projectId}/list',
    summary: 'Ensure Price List',
  })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const project = await loadProjectForOrg(input.projectId, orgId)

    const listId = await ensureListId(project, orgId)
    await invalidateProjectRefinement({
      projectId: project.id,
      organizationId: orgId,
      reason: 'A lista de preços foi vinculada depois do refinamento.',
    })
    return ok({ listId })
  })

// ==========================================
// ADD ITEM — POST /builder/pricing/{projectId}/item
// ==========================================
export const addItem = authed
  .route({
    method: 'POST',
    path: '/builder/pricing/{projectId}/item',
    summary: 'Add Price Item',
  })
  .input(
    z.object({
      ...projectIdParam,
      name: z.string().min(1).max(160),
      price: z.number().min(0),
      description: z.string().max(500).optional(),
      category: z.string().max(80).optional(),
      aliases: z.array(z.string().max(80)).max(20).optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const project = await loadProjectForOrg(input.projectId, orgId)

    const priceListId = await ensureListId(project, orgId)
    const item = await getDatabase().priceItem.create({
      data: {
        priceListId,
        name: input.name,
        priceCents: Math.round(input.price * 100),
        description: input.description,
        category: input.category,
        aliases: (input.aliases ?? []).map((a) => a.toLowerCase()),
      },
      select: { id: true },
    })
    await invalidateProjectRefinement({
      projectId: project.id,
      organizationId: orgId,
      reason: 'Um item de preço foi adicionado depois do refinamento.',
    })
    return ok({ itemId: item.id })
  })

// ==========================================
// DELETE ITEM — DELETE /builder/pricing/{projectId}/item/{itemId}
// ==========================================
export const deleteItem = authed
  .route({
    method: 'DELETE',
    path: '/builder/pricing/{projectId}/item/{itemId}',
    summary: 'Delete Price Item',
  })
  .input(
    z.object({
      ...projectIdParam,
      itemId: z.string().min(1, 'itemId obrigatório'),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const db = getDatabase()
    // Isolamento: item precisa pertencer a uma lista da org.
    const item = await db.priceItem.findFirst({
      where: { id: input.itemId, priceList: { organizationId: orgId } },
      select: { id: true },
    })
    if (!item) throw new ORPCError('NOT_FOUND', { message: 'Item não encontrado' })

    await db.priceItem.delete({ where: { id: item.id } })
    await invalidateProjectRefinement({
      projectId: input.projectId,
      organizationId: orgId,
      reason: 'Um item de preço foi removido depois do refinamento.',
    })
    return ok({ deleted: true })
  })

export const pricingActions = { getPricing, ensureList, addItem, deleteItem }
