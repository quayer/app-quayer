/**
 * Credential routes — escolha e manutenção da chave BYOK usada por um agente.
 *
 *   GET   /credential/:projectId — retorna a chave vinculada atual do agente
 *           ({ provider, organizationProviderId }) para a UI exibir o estado real.
 *   PATCH /credential/:projectId — seta (ou limpa) AIAgentConfig.organizationProviderId
 *           body { organizationProviderId: string | null }
 *           null = volta ao fallback (isPrimary → priority → primeira ativa).
 *           Valida org, categoria AI, provider compatível com o agente e isActive.
 *   PATCH /credential/keys/:id   — atualiza uma chave existente (rótulo e/ou apiKey)
 *           sem criar duplicata. Rotacionar a apiKey reativa a chave.
 *
 * Resolve o agente via BuilderProject.aiAgentId (org-scoped). Espelha o padrão
 * de identity.routes.ts.
 */

import { z } from 'zod'
import { Prisma, ProviderCategory } from '@prisma/client'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import { encrypt } from '@/lib/crypto'

type AuthedUser = { id: string; currentOrgId?: string | null }

const credentialPatchSchema = z.object({
  organizationProviderId: z.string().min(1).nullable(),
})

const credentialKeyPatchSchema = z
  .object({
    apiKey: z.string().trim().min(8).optional(),
    name: z.string().trim().min(1).max(60).optional(),
  })
  .refine((value) => value.apiKey !== undefined || value.name !== undefined, {
    message: 'Informe apiKey e/ou name',
  })

async function loadProject(
  projectId: string,
  organizationId: string,
): Promise<{ id: string; aiAgentId: string | null } | null> {
  return getDatabase().builderProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, aiAgentId: true },
  })
}

const getCredential = igniter.query({
  name: 'Get Agent Credential',
  description:
    'Retorna o provider do agente do projeto e a chave BYOK vinculada (organizationProviderId), para a UI exibir o vínculo atual.',
  path: '/credential/:projectId' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { projectId?: string }
    if (!params.projectId) return response.badRequest('projectId obrigatório')

    const project = await getDatabase().builderProject.findFirst({
      where: { id: params.projectId, organizationId: user.currentOrgId },
      select: {
        aiAgent: { select: { provider: true, organizationProviderId: true } },
      },
    })
    if (!project) return response.notFound('Projeto não encontrado')

    return response.success({
      provider: project.aiAgent?.provider ?? null,
      organizationProviderId: project.aiAgent?.organizationProviderId ?? null,
    })
  },
})

const updateCredential = igniter.mutation({
  name: 'Set Agent Credential',
  description:
    'Vincula (ou limpa) a chave BYOK que o agente do projeto deve usar (AIAgentConfig.organizationProviderId).',
  path: '/credential/:projectId' as const,
  method: 'PATCH',
  use: [authOrApiKeyProcedure({ required: true })],
  body: credentialPatchSchema,
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { projectId?: string }
    if (!params.projectId) return response.badRequest('projectId obrigatório')

    const project = await loadProject(params.projectId, user.currentOrgId)
    if (!project) return response.notFound('Projeto não encontrado')
    if (!project.aiAgentId) {
      return response.badRequest('Projeto ainda não tem agente criado')
    }

    const db = getDatabase()
    const { organizationProviderId } = request.body

    // Valida org + categoria AI + provider compatível + chave ativa — evita
    // vincular uma chave de voz/STT (ou de outro provider LLM) que o runtime
    // mandaria para a API errada e quebraria o agente em produção.
    if (organizationProviderId) {
      const agent = await db.aIAgentConfig.findUnique({
        where: { id: project.aiAgentId },
        select: { provider: true },
      })

      const providerKey = await db.organizationProvider.findFirst({
        where: { id: organizationProviderId, organizationId: user.currentOrgId },
        select: { id: true, provider: true, category: true, isActive: true },
      })
      if (!providerKey) return response.notFound('Chave não encontrada')
      if (providerKey.category !== ProviderCategory.AI) {
        return response.badRequest(
          'Esta chave não é de um provedor de IA (LLM) — selecione uma chave compatível com o agente.',
        )
      }
      if (
        agent &&
        providerKey.provider.toLowerCase() !== agent.provider.toLowerCase()
      ) {
        return response.badRequest(
          `Chave incompatível: o agente usa ${agent.provider} e a chave é do provedor ${providerKey.provider}.`,
        )
      }
      if (!providerKey.isActive) {
        return response.badRequest('Esta chave está inativa — reative-a ou escolha outra.')
      }
    }

    await db.aIAgentConfig.update({
      where: { id: project.aiAgentId },
      data: { organizationProviderId },
    })

    return response.success({ organizationProviderId })
  },
})

const updateCredentialKey = igniter.mutation({
  name: 'Update Provider Key',
  description:
    'Atualiza uma chave BYOK existente (rótulo e/ou valor) sem criar duplicata. Rotacionar a apiKey reativa a chave.',
  path: '/credential/keys/:id' as const,
  method: 'PATCH',
  use: [authOrApiKeyProcedure({ required: true })],
  body: credentialKeyPatchSchema,
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { id?: string }
    if (!params.id) return response.badRequest('id obrigatório')

    const db = getDatabase()
    const existing = await db.organizationProvider.findFirst({
      where: { id: params.id, organizationId: user.currentOrgId },
      select: { id: true, credentials: true },
    })
    if (!existing) return response.notFound('Chave não encontrada')

    const { apiKey, name } = request.body

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

    return response.success({
      id: updated.id,
      name: updated.name,
      isActive: updated.isActive,
      lastFour: apiKey && apiKey.length >= 4 ? apiKey.slice(-4) : null,
      updatedAt: updated.updatedAt.toISOString(),
    })
  },
})

export const credentialRoutes = { getCredential, updateCredential, updateCredentialKey }
