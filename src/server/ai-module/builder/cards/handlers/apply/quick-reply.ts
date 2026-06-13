/**
 * Builder Module — `quick_reply_chips` card application.
 */

import type { BuilderState } from '../../builder-state'
import type { QuickReplyChipsPayload } from '../../card-submit.schemas'
import type { CardApplication } from '../apply-card-submit'

export function applyQuickReplyChips(
  state: BuilderState,
  payload: Pick<QuickReplyChipsPayload, 'value'>,
): CardApplication {
  // No sentinel, no owned field — the chosen chip routes as a NORMAL user turn.
  // State is returned unchanged; the entrypoint skips the persist for this card.
  return {
    next: state,
    cardInstruction: payload.value.trim(),
  }
}
