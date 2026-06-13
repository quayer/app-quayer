import { Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import {
  parseBuilderState,
  type BuilderState,
  type RefinementState,
} from '../cards/builder-state'
import { buildRefinementMaterial } from './refinement-material'
import { runRefinement, DEFAULT_REFINEMENT_AUDITORS } from './run-refinement'
import { runRefinementConversation } from './conversation-runner'
import { generateRefinementScenarios } from '../sub-agents/scenario-generator/scenario-generator'

export type RunProjectRefinementResult =
  | {
      success: true
      conversationId: string
      status: RefinementState['status']
      score: number | undefined
      runId: string
      scenarioCount: number
      checkCount: number
      blockerCount: number
      failedCount: number
      warningCount: number
      message: string
    }
  | {
      success: false
      code:
        | 'CONVERSATION_NOT_FOUND'
        | 'BLUEPRINT_REQUIRED'
        | 'AGENT_REQUIRED'
        | 'PROMPT_VERSION_REQUIRED'
      message: string
    }

function createRunId(): string {
  return `refine_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

async function writeRefinementState(args: {
  conversationId: string
  organizationId: string
  refinement: RefinementState
}): Promise<void> {
  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: args.conversationId, organizationId: args.organizationId },
      select: { builderState: true },
    })
    const fresh = parseBuilderState(row?.builderState)
    const next: BuilderState = {
      ...fresh,
      refinement: args.refinement,
    }
    await tx.builderProjectConversation.updateMany({
      where: { id: args.conversationId, organizationId: args.organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })
  })
}

async function resolvePromptMaterial(input: {
  projectId: string
  organizationId: string
}): Promise<
  | {
      ok: true
      promptVersion: { id: string; versionNumber: number; content: string }
    }
  | { ok: false; code: 'AGENT_REQUIRED' | 'PROMPT_VERSION_REQUIRED'; message: string }
> {
  const project = await database.builderProject.findFirst({
    where: { id: input.projectId, organizationId: input.organizationId },
    select: { aiAgentId: true },
  })
  if (!project?.aiAgentId) {
    return {
      ok: false,
      code: 'AGENT_REQUIRED',
      message: 'Crie o agente antes de rodar o Refinando.',
    }
  }

  const promptVersion = await database.builderPromptVersion.findFirst({
    where: { aiAgentId: project.aiAgentId },
    orderBy: { versionNumber: 'desc' },
    select: { id: true, versionNumber: true, content: true },
  })
  if (!promptVersion) {
    return {
      ok: false,
      code: 'PROMPT_VERSION_REQUIRED',
      message: 'Gere uma versão de prompt antes de rodar o Refinando.',
    }
  }

  return { ok: true, promptVersion }
}

export async function runProjectRefinement(input: {
  projectId: string
  organizationId: string
}): Promise<RunProjectRefinementResult> {
  const conversation = await database.builderProjectConversation.findFirst({
    where: { projectId: input.projectId, organizationId: input.organizationId },
    select: { id: true, builderState: true },
  })
  if (!conversation) {
    return {
      success: false,
      code: 'CONVERSATION_NOT_FOUND',
      message: 'Conversa do Builder não encontrada para este projeto.',
    }
  }

  const state = parseBuilderState(conversation.builderState)
  const blueprint = state.conversationBlueprint
  if (blueprint?.status !== 'approved') {
    return {
      success: false,
      code: 'BLUEPRINT_REQUIRED',
      message:
        'Aprove primeiro o Plano de atendimento antes de rodar o Refining Loop.',
    }
  }

  const promptMaterial = await resolvePromptMaterial(input)
  if (!promptMaterial.ok) {
    return {
      success: false,
      code: promptMaterial.code,
      message: promptMaterial.message,
    }
  }

  const material = buildRefinementMaterial({
    state,
    blueprint,
    promptVersion: promptMaterial.promptVersion,
  })

  const runId = createRunId()
  const startedAt = new Date().toISOString()
  await writeRefinementState({
    conversationId: conversation.id,
    organizationId: input.organizationId,
    refinement: {
      status: 'running',
      runId,
      score: 0,
      startedAt,
      checks: [],
      blockers: [],
      material,
    },
  })

  const scenarios = generateRefinementScenarios(blueprint)
  const result = await runRefinement({
    projectId: input.projectId,
    organizationId: input.organizationId,
    blueprint,
    scenarios,
    runner: runRefinementConversation,
    auditors: DEFAULT_REFINEMENT_AUDITORS,
    runId,
    material,
    now: () => new Date(),
  })

  const finalState: RefinementState = { ...result.state, material }

  await writeRefinementState({
    conversationId: conversation.id,
    organizationId: input.organizationId,
    refinement: finalState,
  })

  const failed = finalState.checks.filter((check) => check.status === 'fail')
  const warnings = finalState.checks.filter(
    (check) => check.status === 'warning',
  )

  return {
    success: true,
    conversationId: conversation.id,
    status: finalState.status,
    score: finalState.score,
    runId,
    scenarioCount: scenarios.length,
    checkCount: finalState.checks.length,
    blockerCount: finalState.blockers.length,
    failedCount: failed.length,
    warningCount: warnings.length,
    message:
      finalState.blockers.length > 0
        ? 'Refinamento concluído com falhas críticas. Não publique antes de corrigir os pontos bloqueantes.'
        : 'Refinamento concluído. Use o resumo para decidir os próximos ajustes antes de publicar.',
  }
}
