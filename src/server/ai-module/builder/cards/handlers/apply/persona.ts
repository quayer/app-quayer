/**
 * Builder Module — `agent_persona` card application (W3, Revisar).
 *
 * Pure `(state, persona) => CardApplication`: applies the persona's OWNED fields
 * via the builder-state helpers and flips the `persona` sentinel. Extracted from
 * `apply-card-submit.ts` (T22) to keep the entrypoint a thin dispatch under the
 * 800-line service ceiling. ZERO behavior change — same signature/copy as before.
 */

import {
  patchBuilderState,
  applyConfirmation,
  type BuilderState,
  type DeepPartial,
} from '../../builder-state'
import type { AgentPersonaPayload } from '../../card-submit.schemas'
import type { CardApplication } from '../apply-card-submit'

export function applyAgentPersona(
  state: BuilderState,
  persona: AgentPersonaPayload['persona'],
): CardApplication {
  // Only carry fields the user actually supplied (deepMerge ignores undefined).
  // G7 — `speechMode` (estilo de voz) é OPCIONAL e additivo: persiste verbatim
  // quando vier, e o deepMerge descarta `undefined` quando não vier.
  const patch: DeepPartial<BuilderState> = {
    persona: {
      name: persona.name,
      tone: persona.tone,
      style: persona.style,
      greeting: persona.greeting,
      speechMode: persona.speechMode,
    },
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'persona')

  const bits: string[] = []
  if (persona.name) bits.push(`nome "${persona.name}"`)
  if (persona.tone) bits.push(`tom "${persona.tone}"`)
  if (persona.style) bits.push(`estilo "${persona.style}"`)
  const summary = bits.length > 0 ? bits.join(', ') : 'os valores informados'
  return {
    next,
    cardInstruction:
      `O usuário DEFINIU a persona do agente via card (${summary}). ` +
      'Use a saudação configurada e siga para o próximo passo da jornada. ' +
      'Não reabra o card de persona.',
  }
}
