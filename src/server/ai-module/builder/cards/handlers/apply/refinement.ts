import { runProjectRefinement } from '../../../refinement/run-project-refinement'
import type { ApplyCardSubmitResult } from '../apply-card-submit'

export async function applyRefinementRun(args: {
  projectId: string
  organizationId: string
}): Promise<ApplyCardSubmitResult> {
  const result = await runProjectRefinement(args)

  if (!result.success) {
    if (result.code === 'CONVERSATION_NOT_FOUND') {
      return {
        ok: false,
        reason: 'not_found',
        message: result.message,
      }
    }
    return {
      ok: false,
      reason: 'invalid',
      message: result.message,
    }
  }

  return {
    ok: true,
    conversationId: result.conversationId,
    cardInstruction:
      `O Refinando terminou com status ${result.status}, score ${result.score ?? 'sem score'}, ` +
      `${result.checkCount} check(s), ${result.blockerCount} bloqueio(s), ` +
      `${result.failedCount} falha(s) e ${result.warningCount} aviso(s). ` +
      'Mostre o resumo do refinamento e siga a jornada conforme o resultado. Não reabra o card de plano de atendimento.',
  }
}
