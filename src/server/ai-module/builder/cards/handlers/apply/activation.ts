/**
 * Builder Module — `activation_mode` card application.
 */

import {
  patchBuilderState,
  applyConfirmation,
  type BuilderState,
  type DeepPartial,
} from '../../builder-state'
import type { ActivationModePayload } from '../../card-submit.schemas'
import { sanitizeStringList, type CardApplication } from '../apply-card-submit'

export function applyActivationMode(
  state: BuilderState,
  payload: Pick<ActivationModePayload, 'mode' | 'keywords'>,
): CardApplication {
  const keywords = sanitizeStringList(payload.keywords)
  const patch: DeepPartial<BuilderState> = {
    activation: { mode: payload.mode, keywords },
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'activation')

  const keywordsLabel = keywords.length > 0 ? keywords.join(', ') : '(nenhuma)'
  return {
    next,
    cardInstruction:
      `O usuário ESCOLHEU o modo de ativação via card: "${payload.mode}" (palavras-chave: ${keywordsLabel}). ` +
      'Considere esse modo no comportamento do agente e siga para o próximo passo. ' +
      'Não reabra o card de modo de ativação.',
  }
}
