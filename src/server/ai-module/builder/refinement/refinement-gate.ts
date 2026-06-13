import type {
  BuilderState,
  RefinementMaterial,
  RefinementState,
} from '../cards/builder-state'

function finishSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`
}

export function buildRefinementPublishBlockerMessage(
  detail: string | null,
): string {
  return `Publicação bloqueada pelo refinamento: ${finishSentence(
    detail ?? 'corrija as falhas críticas antes de publicar',
  )}`
}

export function getCriticalRefinementBlockerMessage(
  refinement: RefinementState | undefined,
): string | null {
  if (!refinement) return null

  const blocker = refinement.blockers.find(
    (item) => item.severity === 'critical',
  )
  if (blocker) return blocker.message

  const failedCheck = refinement.checks.find(
    (check) => check.status === 'fail' && check.severity === 'critical',
  )
  if (failedCheck) {
    return (
      failedCheck.recommendation ??
      failedCheck.evidence ??
      `Falha crítica em ${failedCheck.label ?? failedCheck.checkId}.`
    )
  }

  if (
    refinement.status === 'failed' &&
    refinement.blockers.length === 0 &&
    refinement.checks.length === 0
  ) {
    return 'Corrija as falhas críticas antes de publicar.'
  }

  return null
}

export function getRefinementPublishGateMessage(
  state: Pick<BuilderState, 'journeyVersion' | 'refinement'>,
  expectedMaterial?: Partial<RefinementMaterial>,
): string | null {
  if (state.journeyVersion !== 2) return null

  const refinement = state.refinement
  if (!refinement) {
    return 'Rode o refinamento antes de publicar.'
  }

  if (refinement.status === 'running') {
    return 'Aguarde o refinamento terminar antes de publicar.'
  }

  const criticalMessage = getCriticalRefinementBlockerMessage(refinement)
  if (criticalMessage) return criticalMessage

  if (refinement.status === 'idle') {
    return 'Rode o refinamento antes de publicar.'
  }

  if (refinement.status === 'passed') {
    if (expectedMaterial) {
      const material = refinement.material
      if (!material) {
        return 'Rode o refinamento novamente para validar a versão atual do agente.'
      }
      if (
        expectedMaterial.promptVersionId &&
        material.promptVersionId !== expectedMaterial.promptVersionId
      ) {
        return 'Rode o refinamento novamente; a versão do prompt mudou desde a última validação.'
      }
      if (
        expectedMaterial.promptHash &&
        material.promptHash &&
        material.promptHash !== expectedMaterial.promptHash
      ) {
        return 'Rode o refinamento novamente; o conteúdo do prompt mudou desde a última validação.'
      }
      if (
        expectedMaterial.blueprintHash &&
        material.blueprintHash &&
        material.blueprintHash !== expectedMaterial.blueprintHash
      ) {
        return 'Rode o refinamento novamente; o plano de atendimento mudou desde a última validação.'
      }
      if (
        expectedMaterial.contextHash &&
        material.contextHash &&
        material.contextHash !== expectedMaterial.contextHash
      ) {
        return 'Rode o refinamento novamente; o contexto do agente mudou desde a última validação.'
      }
    }
    return null
  }

  if (refinement.status === 'needs_user_decision') {
    return 'Revise as decisões pendentes do refinamento antes de publicar.'
  }

  return 'Corrija as falhas do refinamento antes de publicar.'
}
