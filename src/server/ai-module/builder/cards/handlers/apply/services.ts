/**
 * Builder Module — `services` card application (W3, Revisar).
 *
 * Pure `(state, payload) => CardApplication`: sanitizes the offered/notOffered
 * lists, applies them via the builder-state helpers and flips the `services`
 * sentinel. Product copy calls this "Escopo do atendimento"; the persisted
 * contract remains `services` for compatibility.
 */

import {
  patchBuilderState,
  applyConfirmation,
  type BuilderState,
  type DeepPartial,
} from '../../builder-state'
import type { ServicesPayload } from '../../card-submit.schemas'
import { sanitizeStringList, type CardApplication } from '../apply-card-submit'

export function applyServices(
  state: BuilderState,
  payload: Pick<ServicesPayload, 'offered' | 'notOffered'>,
): CardApplication {
  const offered = sanitizeStringList(payload.offered)
  const notOffered = sanitizeStringList(payload.notOffered)
  const patch: DeepPartial<BuilderState> = {
    services: { offered, notOffered },
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'services')

  const offeredLabel = offered.length > 0 ? offered.join(', ') : '(nenhum)'
  const notOfferedLabel =
    notOffered.length > 0 ? notOffered.join(', ') : '(nenhum)'
  return {
    next,
    cardInstruction:
      `O usuário INFORMOU o escopo do atendimento via card. Pode responder/conduzir: ${offeredLabel}. Não deve prometer: ${notOfferedLabel}. ` +
      'Incorpore isso ao escopo do agente e siga para o próximo passo. ' +
      'Não reabra o card de escopo.',
  }
}
