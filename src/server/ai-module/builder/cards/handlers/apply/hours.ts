/**
 * Builder Module — `business_hours` card application (W3, Revisar).
 *
 * Pure `(state, payload) => CardApplication`: stores the (opaque) schedule + preset
 * + timezone and the additive `outOfHours` behavior for the human team, then flips the `hours`
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
  // Onda 3d — descreve expectativa de atendimento humano fora do horário.
  const outOfHoursNote =
    payload.outOfHours === 'silent'
      ? ' Fora do horário da equipe, a IA continua respondendo sozinha e não promete retorno humano imediato.'
      : payload.outOfHours === 'reply_notice'
        ? ' Fora do horário da equipe, a IA continua respondendo e avisa quando a equipe humana retorna.'
        : ''
  return {
    next,
    cardInstruction:
      `O usuário DEFINIU o horário da equipe humana via card (${presetLabel}).${outOfHoursNote} ` +
      'Considere esse horário apenas para handoff/expectativa de retorno humano e siga para o próximo passo. ' +
      'Não reabra o card de horários.',
  }
}
