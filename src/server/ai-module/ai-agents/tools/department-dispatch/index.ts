/**
 * department-dispatch — barrel
 *
 * Round-robin (roleta) distribution of conversations to department members.
 * Exposto ao runtime via a tool UNIFICADA transfer_to_human (routing:'department'),
 * que chama executeDispatchToAgent. Não há mais um tool `dispatch_to_agent`
 * próprio (consolidado na Fase 2 — ver transfer-to-human.tool.ts).
 */

export {
  executeDispatchToAgent,
  dispatchToAgentInputSchema,
} from './dispatch-to-agent'
export type {
  DispatchToAgentInput,
  DispatchToAgentResult,
} from './dispatch-to-agent'

export {
  selectNextMember,
  loadActivePool,
  pickNextInOrder,
} from './round-robin.service'
export type {
  RouletteCandidate,
  SelectMemberResult,
} from './round-robin.service'

export {
  trySendRouletteWhatsApp,
  buildRouletteNotifyText,
  rouletteNotifyRateLimiter,
} from './notify-member-whatsapp'
export type {
  TrySendRouletteWhatsAppArgs,
  TrySendRouletteWhatsAppResult,
  RouletteNotifySkipReason,
} from './notify-member-whatsapp'
