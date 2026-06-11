/**
 * Builder Module — `business_hours` card application (W3, Revisar).
 *
 * Pure `(state, payload) => CardApplication`: stores the (opaque) schedule + preset
 * + timezone and the additive `outOfHours` behavior, then flips the `hours`
 * sentinel. Extracted from `apply-card-submit.ts` (T22) to keep the entrypoint a
 * thin dispatch under the 800-line service ceiling. ZERO behavior change — same
 * signature/copy as before.
 */

import {
  patchBuilderState,
  applyConfirmation,
  type BuilderState,
  type DeepPartial,
} from '../../builder-state'
import type { BusinessHoursPayload } from '../../card-submit.schemas'
import type { CardApplication } from '../apply-card-submit'

export function applyBusinessHours(
  state: BuilderState,
  payload: Pick<
    BusinessHoursPayload,
    'preset' | 'schedule' | 'timezone' | 'outOfHours'
  >,
): CardApplication {
  // `schedule` is opaque (card owns its shape) — store verbatim. Onda 3d:
  // `outOfHours` (additivo) só entra no patch quando vier — deepMerge ignora
  // undefined, então um payload legado nunca sobrescreve um valor já salvo.
  const patch: DeepPartial<BuilderState> = {
    hours: {
      preset: payload.preset,
      schedule: payload.schedule,
      timezone: payload.timezone,
      ...(payload.outOfHours ? { outOfHours: payload.outOfHours } : {}),
    },
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'hours')

  const presetLabel = payload.preset ? `preset "${payload.preset}"` : 'horário manual'
  // Onda 3d — descreve o comportamento fora do horário na copy do ACK.
  const outOfHoursNote =
    payload.outOfHours === 'silent'
      ? ' Fora do horário, o agente fica em SILÊNCIO (não responde).'
      : payload.outOfHours === 'reply_notice'
        ? ' Fora do horário, o agente RESPONDE avisando que está fora do expediente.'
        : ''
  return {
    next,
    cardInstruction:
      `O usuário DEFINIU o horário de atendimento via card (${presetLabel}).${outOfHoursNote} ` +
      'Considere esse horário no comportamento do agente e siga para o próximo passo. ' +
      'Não reabra o card de horários.',
  }
}
