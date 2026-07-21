/**
 * Builder Projects/Prompt — porta mecânica para oRPC (lote B1 do builder).
 *
 * Origem: ./prompt.routes.ts (3 actions).
 *
 * URLs: PATCH /builder/projects/:id/prompt · GET /builder/projects/:id/versions
 *       · POST /builder/projects/:id/prompt/rollback
 *
 * NOTA 409: o conflito de precondição otimista do updatePrompt carrega
 * payload que o editor LÊ (prompt atual do servidor). No oRPC ele viaja no
 * `data` do ORPCError('CONFLICT') com o MESMO shape interno — o call-site
 * migra junto com o client no cutover.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import {
  updatePromptBodySchema,
  updatePromptParamsSchema,
  rollbackPromptBodySchema,
} from '../../builder.schemas'
import { builderProjectRepository } from '../projects.repository'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from './crud.orpc'

const projectIdParam = { id: z.string().uuid('ID de projeto inválido') }
const authed = base.use(authOrApiKey)

// ==========================================
// UPDATE PROMPT — PATCH /builder/projects/{id}/prompt
// ==========================================
export const updatePrompt = authed
  .route({
    method: 'PATCH',
    path: '/builder/projects/{id}/prompt',
    summary: 'Update Agent System Prompt',
  })
  .input(
    updatePromptBodySchema.extend({
      ...projectIdParam,
      baseUpdatedAt: z.string().datetime().optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const { id, systemPrompt, baseUpdatedAt } = input

    try {
      const result = await builderProjectRepository.updateAgentSystemPrompt(
        id,
        orgId,
        systemPrompt,
        baseUpdatedAt ? { baseUpdatedAt: new Date(baseUpdatedAt) } : undefined,
      )

      if (!result) {
        throw new ORPCError('NOT_FOUND', { message: 'Projeto ou agente não encontrado' })
      }

      if (result.conflict) {
        // Payload do original preservado no data do erro (o editor lê o
        // prompt atual do servidor para resolver o conflito).
        throw new ORPCError('CONFLICT', {
          message: 'O prompt foi alterado no servidor desde a sua última edição.',
          data: {
            success: false,
            error: 'prompt_conflict',
            data: {
              id: result.current.id,
              systemPrompt: result.current.systemPrompt,
              updatedAt: result.current.updatedAt,
            },
          },
        })
      }

      return ok({
        success: true,
        data: {
          id: result.agent.id,
          systemPrompt: result.agent.systemPrompt,
          updatedAt: result.agent.updatedAt,
        },
        message: 'Prompt salvo',
      })
    } catch (error: unknown) {
      if (error instanceof ORPCError) throw error
      console.error('[projectsRoutes.updatePrompt] Erro ao salvar prompt:', error)
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      throw new ORPCError('BAD_REQUEST', { message: `Erro ao salvar prompt: ${message}` })
    }
  })

// ==========================================
// LIST VERSIONS — GET /builder/projects/{id}/versions
// ==========================================
export const listVersions = authed
  .route({
    method: 'GET',
    path: '/builder/projects/{id}/versions',
    summary: 'List Builder Prompt Versions',
  })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const rows = await builderProjectRepository.listVersionsForProject(input.id, orgId)

    if (rows === null) {
      throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })
    }

    return ok({
      versions: rows.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        content: v.content,
        description: v.description ?? null,
        createdBy: v.createdBy as 'chat' | 'manual' | 'rollback',
        publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
        publishedBy: v.publisher ? { id: v.publisher.id, name: v.publisher.name } : null,
        createdAt: v.createdAt.toISOString(),
      })),
    })
  })

// ==========================================
// ROLLBACK — POST /builder/projects/{id}/prompt/rollback
// ==========================================
export const rollbackPrompt = authed
  .route({
    method: 'POST',
    path: '/builder/projects/{id}/prompt/rollback',
    summary: 'Rollback Agent Prompt',
  })
  .input(rollbackPromptBodySchema.extend(projectIdParam))
  .handler(async ({ input, context }) => {
    const { userId, orgId } = builderOrg(context)
    const { id, targetVersionId } = input

    try {
      const result = await builderProjectRepository.rollbackToVersion(
        id,
        orgId,
        targetVersionId,
        userId,
      )

      if (!result) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Projeto, agente ou versão alvo não encontrado',
        })
      }

      return ok({
        versionId: result.newVersion.id,
        versionNumber: result.newVersion.versionNumber,
        content: result.newVersion.content,
      })
    } catch (error: unknown) {
      if (error instanceof ORPCError) throw error
      console.error('[projectsRoutes.rollbackPrompt] Erro ao reverter prompt:', error)
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      throw new ORPCError('BAD_REQUEST', { message: `Erro ao reverter prompt: ${message}` })
    }
  })

export const promptActions = {
  updatePrompt,
  listVersions,
  rollbackPrompt,
}
