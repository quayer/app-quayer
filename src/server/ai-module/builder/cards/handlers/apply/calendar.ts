/**
 * Builder Module — `calendar_connect` card application.
 *
 * Pure `(state, payload) => CardApplication`: stores the calendar status and
 * flips the `calendar` sentinel only for a real connection or explicit skip.
 */

import {
  patchBuilderState,
  applyConfirmation,
  type BuilderState,
  type DeepPartial,
} from '../../builder-state'
import type { CalendarConnectPayload } from '../../card-submit.schemas'
import type { CardApplication } from '../apply-card-submit'

/**
 * G10 — valores de `status` que significam "o usuário optou por seguir SEM agenda"
 * (escape hatch "Continuar sem agenda" após N tentativas de conexão falharem). O
 * schema mantém `status` como string opcional (≤120), então 'skipped' já cabe sem
 * mudança de contrato. Junto com CALENDAR_CONNECTED_STATUSES, gateia o flip do
 * sentinel `confirmations.calendar` (FR-11) além de ramificar a copy do ACK.
 */
const CALENDAR_SKIPPED_STATUSES: ReadonlySet<string> = new Set([
  'skipped',
  'skip',
  'none',
])

/**
 * FR-11 (jornada-builder-v2) — valores de `status` que significam conexão REAL.
 * Espelha 1:1 o conjunto `connected` do `resolvePhase` do card
 * (calendar-connect-card.tsx): FE e BE concordam sobre o que é "conectado".
 */
const CALENDAR_CONNECTED_STATUSES: ReadonlySet<string> = new Set([
  'connected',
  'active',
  'ok',
  'ready',
  'linked',
])

export function applyCalendarConnect(
  state: BuilderState,
  payload: Pick<CalendarConnectPayload, 'connectionId' | 'status'>,
): CardApplication {
  // builderState only — the deploy saga owns the real CalendarConnection.
  // `status` é persistido verbatim (inclui 'skipped' do escape hatch).
  const patch: DeepPartial<BuilderState> = {
    calendar: {
      connectionId: payload.connectionId,
      status: payload.status,
    },
  }
  const patched = patchBuilderState(state, patch)

  const normalizedStatus = (payload.status ?? '').trim().toLowerCase()
  const isSkipped = CALENDAR_SKIPPED_STATUSES.has(normalizedStatus)
  const isConnected = CALENDAR_CONNECTED_STATUSES.has(normalizedStatus)

  // FR-11 — o flip de `confirmations.calendar` SÓ acontece com conexão REAL ou
  // pulo EXPLÍCITO. Qualquer outro status (vazio, connecting, error, …) persiste
  // o progresso mas NÃO confirma: o passo `calendar` continua pendente em
  // nextPendingStep e o ACK é honesto — nunca "conectado" sem conectar.
  if (!isConnected && !isSkipped) {
    return {
      next: patched,
      cardInstruction:
        'O usuário INICIOU a conexão da agenda via card, mas a conexão AINDA NÃO foi concluída ' +
        `(status atual: ${payload.status ? `"${payload.status}"` : 'nenhum'} — aguardando conexão da agenda). ` +
        'NÃO confirme a agenda como conectada e NÃO prometa agendamentos: oriente o usuário a concluir a autorização do calendário. ' +
        'O card de conexão continua disponível até conectar de fato ou o usuário optar por seguir sem agenda.',
    }
  }

  const next = applyConfirmation(patched, 'calendar')

  // G10 — escape hatch: o usuário seguiu sem conectar a agenda. O agente deve
  // qualificar + avisar a equipe, NUNCA prometer agendamento.
  if (isSkipped) {
    return {
      next,
      cardInstruction:
        'O usuário optou por CONTINUAR SEM AGENDA (não conectou um calendário). ' +
        'NÃO prometa marcar horários nem confirme agendamentos: qualifique o lead e avise a equipe responsável para o contato humano dar sequência. ' +
        'Siga para o próximo passo da jornada. Não reabra o card de conexão de agenda (o usuário pode reconectar depois se quiser).',
    }
  }

  return {
    next,
    cardInstruction:
      `O usuário CONECTOU a agenda via card (status "${payload.status ?? 'connected'}"). ` +
      'Use a agenda conectada para agendamentos e siga para o próximo passo. ' +
      'Não reabra o card de conexão de agenda.',
  }
}
