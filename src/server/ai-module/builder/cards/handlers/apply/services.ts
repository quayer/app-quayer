/**
 * Builder Module — `services` card application (W3, Revisar).
 *
 * Pure `(state, payload) => CardApplication`: sanitizes the offered/notOffered
 * lists, applies them via the builder-state helpers and flips the `services`
 * sentinel. Extracted from `apply-card-submit.ts` (T22) to keep the entrypoint a
 * thin dispatch under the 800-line service ceiling. ZERO behavior change — same
 * signature/copy as before. `sanitizeStringList` stays a transversal helper in the
 * entrypoint (also used by handoff/activation/source) and is imported from there.
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
      `O usuário INFORMOU os serviços via card. Oferece: ${offeredLabel}. Não oferece: ${notOfferedLabel}. ` +
      'Incorpore isso ao escopo do agente e siga para o próximo passo. ' +
      'Não reabra o card de serviços.',
  }
}
