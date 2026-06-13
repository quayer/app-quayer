/**
 * Builder Module — `preview_summary` confirm-only card application.
 */

import { applyConfirmation, type BuilderState } from '../../builder-state'
import type { CardApplication } from '../apply-card-submit'

export function applyPreviewSummary(state: BuilderState): CardApplication {
  // Confirm-only deploy gate — flip `summary`, no owned fields.
  const next = applyConfirmation(state, 'summary')
  return {
    next,
    cardInstruction:
      'O usuário CONFIRMOU o resumo de pré-visualização ("Tudo certo?") via card. ' +
      'Todos os passos da jornada estão revisados — prossiga para a publicação (deploy) do agente. ' +
      'Não reabra o card de resumo.',
  }
}
