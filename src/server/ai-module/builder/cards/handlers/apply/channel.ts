/**
 * Builder Module — `channel` card application (W2).
 *
 * Pure `(state, channelKey) => CardApplication`: stores the chosen channel and
 * flips the `channel` sentinel. Extracted from `apply-card-submit.ts` to keep the
 * entrypoint a thin dispatch under the 800-line service ceiling. ZERO behavior
 * change — same signature/copy as before. The entrypoint still owns the
 * defense-in-depth `isValidChannelKey` re-check against the canonical catalog
 * before calling this handler.
 */

import {
  patchBuilderState,
  applyConfirmation,
  type BuilderState,
  type DeepPartial,
} from '../../builder-state'
import type { ChannelKey } from '../../card-submit.schemas'
import type { CardApplication } from '../apply-card-submit'

export function applyChannel(
  state: BuilderState,
  channelKey: ChannelKey,
): CardApplication {
  const patch: DeepPartial<BuilderState> = { selectedChannelKey: channelKey }
  const next = applyConfirmation(patchBuilderState(state, patch), 'channel')
  return {
    next,
    cardInstruction:
      `O usuário ESCOLHEU o canal "${channelKey}" via card. ` +
      'Conduza a publicação nesse canal (create_whatsapp_instance ou o fluxo do canal correspondente) e siga a jornada. ' +
      'Não reabra o seletor de canais.',
  }
}
