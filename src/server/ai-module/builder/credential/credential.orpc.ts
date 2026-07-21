/**
 * Builder Credential — porta mecânica para oRPC (lote B5 do builder).
 *
 * Origem: ./credential.routes.ts (3 actions).
 *   getCredential       GET   /builder/credential/:projectId
 *   updateCredential    PATCH /builder/credential/:projectId
 *   updateCredentialKey PATCH /builder/credential/keys/:id
 *
 * Validações preservadas: org + categoria AI + provider compatível + isActive
 * antes do vínculo; rotação de apiKey (encrypt) reativa a chave.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { Prisma, ProviderCategory } from '@prisma/client'
import { getDatabase } from '@/server/services/database'
import { encrypt } from '@/lib/crypto'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const projectIdParam = { projectId: z.string().min(1, 'projectId obrigatório') }
const authed = base.use(authOrApiKey)

// ==========================================
// GET — GET /builder/credential/{projectId}
// ==========================================
export const getCredential = authed
  .route({
    method: 'GET',
    path: '/builder/credential/{projectId}',
    summary: 'Get Agent Credential',
  })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const project = await getDatabase().builderProject.findFirst({
      where: { id: input.projectId, organizationId: orgId },
      select: {
        aiAgent: { select: { provider: true, organizationProviderId: true } },
      },
    })
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    return ok({
      provider: project.aiAgent?.provider ?? null,
      organizationProviderId: project.aiAgent?.organizationProviderId ?? null,
    })
  })

// ==========================================
// SET — PATCH /builder/credential/{projectId}
// ==========================================
export const updateCredential = authed
  .route({
    method: 'PATCH',
    path: '/builder/credential/{projectId}',
    summary: 'Set Agent Credential',
  })
  .input(
    z.object({
      ...projectIdParam,
      organizationProviderId: z.string().min(1).nullable(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const project = await getDatabase().builderProject.findFirst({
      where: { id: input.projectId, organizationId: orgId },
      select: { id: true, aiAgentId: true },
    })
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })
    if (!project.aiAgentId) {
      throw new ORPCError('BAD_REQUEST', { message: 'Projeto ainda não tem agente criado' })
    }

    const db = getDatabase()
    const { organizationProviderId } = input

    // Valida org + categoria AI + provider compatível + chave ativa.
    if (organizationProviderId) {
      const agent = await db.aIAgentConfig.findUnique({
        where: { id: project.aiAgentId },
        select: { provider: true },
      })

      const providerKey = await db.organizationProvider.findFirst({
        where: { id: organizationProviderId, organizationId: orgId },
        select: { id: true, provider: true, category: true, isActive: true },
      })
      if (!providerKey) {
        throw new ORPCError('NOT_FOUND', { message: 'Chave não encontrada' })
      }
      if (providerKey.category !== ProviderCategory.AI) {
        throw new ORPCError('BAD_REQUEST', {
          message:
            'Esta chave não é de um provedor de IA (LLM) — selecione uma chave compatível com o agente.',
        })
      }
      if (
        agent &&
        providerKey.provider.toLowerCase() !== agent.provider.toLowerCase()
      ) {
        throw new ORPCError('BAD_REQUEST', {
          message: `Chave incompatível: o agente usa ${agent.provider} e a chave é do provedor ${providerKey.provider}.`,
        })
      }
      if (!providerKey.isActive) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Esta chave está inativa — reative-a ou escolha outra.',
        })
      }
    }

    await db.aIAgentConfig.update({
      where: { id: project.aiAgentId },
      data: { organizationProviderId },
    })

    return ok({ organizationProviderId })
  })

// ==========================================
// UPDATE KEY — PATCH /builder/credential/keys/{id}
// ==========================================
export const updateCredentialKey = authed
  .route({
    method: 'PATCH',
    path: '/builder/credential/keys/{id}',
    summary: 'Update Provider Key',
  })
  .input(
    z
      .object({
        id: z.string().min(1, 'id obrigatório'),
        apiKey: z.string().trim().min(8).optional(),
        name: z.string().trim().min(1).max(60).optional(),
      })
      .refine((value) => value.apiKey !== undefined || value.name !== undefined, {
        message: 'Informe apiKey e/ou name',
      }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const db = getDatabase()
    const existing = await db.organizationProvider.findFirst({
      where: { id: input.id, organizationId: orgId },
      select: { id: true, credentials: true },
    })
    if (!existing) throw new ORPCError('NOT_FOUND', { message: 'Chave não encontrada' })

    const { apiKey, name } = input

    const data: Prisma.OrganizationProviderUpdateInput = {}
    if (name !== undefined) data.name = name
    if (apiKey !== undefined) {
      // Preserva campos extras do Json `credentials`, trocando só a apiKey.
      const currentCredentials =
        existing.credentials !== null &&
        typeof existing.credentials === 'object' &&
        !Array.isArray(existing.credentials)
          ? (existing.credentials as Record<string, unknown>)
          : {}
      data.credentials = {
        ...currentCredentials,
        apiKey: encrypt(apiKey),
      } as Prisma.InputJsonValue
      // Rotacionar a chave reativa o registro (chave nova = chave válida).
      data.isActive = true
    }

    const updated = await db.organizationProvider.update({
      where: { id: existing.id },
      data,
      select: { id: true, name: true, isActive: true, updatedAt: true },
    })

    return ok({
      id: updated.id,
      name: updated.name,
      isActive: updated.isActive,
      lastFour: apiKey && apiKey.length >= 4 ? apiKey.slice(-4) : null,
      updatedAt: updated.updatedAt.toISOString(),
    })
  })

export const credentialActions = { getCredential, updateCredential, updateCredentialKey }
