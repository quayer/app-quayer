/**
 * publishVersion handler — step 1 of the Builder deploy saga.
 *
 * Promotes a BuilderPromptVersion to "published" status by delegating to the
 * existing repository method. Framework-agnostic: no HTTP concerns.
 *
 * Touches tables:
 *   - BuilderPromptVersion  (UPDATE publishedAt, publishedBy)
 *   - BuilderProject        (UPDATE status = 'production')
 *
 * Idempotent: re-running after a successful publish simply re-stamps
 * publishedAt — safe but should be avoided by the orchestrator checking
 * context.state.publishedAt before calling.
 */

import { builderProjectRepository } from '../projects/projects.repository'
import { database } from '@/server/services/database'
import type { DeployContext } from './deploy.contract'

export interface PublishVersionResult {
  publishedAt: Date
  versionNumber: number
}

export async function publishVersion(
  context: DeployContext,
): Promise<PublishVersionResult> {
  // Guard: agent must exist (validated upstream in orchestrator too, but
  // defensive here so the handler is safe when called directly in tests).
  if (!context.aiAgentId) {
    throw new Error(
      'Projeto não possui um agente associado — não é possível publicar',
    )
  }

  // Validate that the promptVersion belongs to the project's agent.
  const version = await database.builderPromptVersion.findFirst({
    where: {
      id: context.promptVersionId,
      aiAgentId: context.aiAgentId,
    },
    select: { id: true, versionNumber: true, aiAgentId: true },
  })

  if (!version) {
    throw new Error(
      `Versão de prompt ${context.promptVersionId} não pertence ao agente ${context.aiAgentId}`,
    )
  }

  // Idempotency short-circuit — if the caller already has state, skip.
  if (context.state.publishedAt && context.state.versionNumber != null) {
    return {
      publishedAt: context.state.publishedAt,
      versionNumber: context.state.versionNumber,
    }
  }

  try {
    const published = await builderProjectRepository.publishVersion({
      projectId: context.projectId,
      promptVersionId: context.promptVersionId,
      publishedBy: context.userId,
    })

    const publishedAt = published.publishedAt ?? new Date()
    const versionNumber = published.versionNumber

    // Mutate shared state so downstream steps see the result.
    context.state.publishedAt = publishedAt
    context.state.versionNumber = versionNumber

    return { publishedAt, versionNumber }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Erro desconhecido ao publicar'
    throw new Error(`Falha ao publicar versão do prompt: ${message}`)
  }
}

/**
 * Compensation: unset publishedAt on the BuilderPromptVersion.
 * Called by rollback handler when a later step fails.
 */
export async function unpublishVersion(
  context: DeployContext,
): Promise<void> {
  if (!context.state.publishedAt) return
  await database.builderPromptVersion.update({
    where: { id: context.promptVersionId },
    data: { publishedAt: null, publishedBy: null },
  })
  await database.builderProject.update({
    where: { id: context.projectId },
    data: { status: 'draft' },
  })
}
