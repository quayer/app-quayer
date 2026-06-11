/**
 * Builder Module — `handoff` card application (Onda 2).
 *
 * FUSÃO de qualification_action + qualification_steps + team_structure +
 * handoff_pairing num único handler. Pure `(state, payload) => CardApplication`:
 * grava `builderState.handoff.*` + flipa `handoff`. Extracted from
 * `apply-card-submit.ts` to keep the entrypoint a thin dispatch under the
 * 800-line service ceiling. ZERO behavior change — same signature/copy as before.
 *
 * `sanitizeTeamMembers` é usado SÓ por este handler, então mora aqui;
 * `sanitizeStringList` e `normalizeWhatsappBr` continuam helpers transversais no
 * entrypoint (também usados por activation/source e silenced_contacts) e são
 * importados de lá. O roster (members) só é relevante em roleta/departamentos
 * (em solo/nenhum vem vazio). `connectionId` por membro habilita warm transfer
 * (runtime valida tenant-scoped, fail-open). A saga materializa
 * Department/DepartmentMember + routing conforme o `mode`.
 */

import {
  patchBuilderState,
  applyConfirmation,
  type BuilderState,
  type DeepPartial,
} from '../../builder-state'
import type { HandoffPayload } from '../../card-submit.schemas'
import {
  sanitizeStringList,
  normalizeWhatsappBr,
  type CardApplication,
} from '../apply-card-submit'

/**
 * Re-validate team members server-side: keep position as a non-negative int,
 * trim string fields and normalizar o WhatsApp (G6) para E.164-BR — incluindo o
 * campo só quando confiável (espelha o opcional `userId`).
 */
function sanitizeTeamMembers(
  members: HandoffPayload['members'],
): HandoffPayload['members'] {
  return members.map((m) => {
    const userId = m.userId?.trim()
    const name = m.name?.trim()
    const whatsapp = normalizeWhatsappBr(m.whatsapp)
    const connectionId = m.connectionId?.trim()
    return {
      position: Math.max(0, Math.trunc(m.position)),
      ...(userId && userId.length > 0 ? { userId } : {}),
      ...(name && name.length > 0 ? { name } : {}),
      ...(whatsapp ? { whatsapp } : {}),
      // F0 — só transita; o runtime valida tenant-scoped (fail-open).
      ...(connectionId && connectionId.length > 0 ? { connectionId } : {}),
    }
  })
}

export function applyHandoff(
  state: BuilderState,
  payload: Pick<
    HandoffPayload,
    | 'mode'
    | 'alsoSchedule'
    | 'steps'
    | 'departmentName'
    | 'departmentType'
    | 'members'
    | 'openingMessage'
  >,
): CardApplication {
  const steps = sanitizeStringList(payload.steps)
  const members = sanitizeTeamMembers(payload.members)
  const openingMessage = payload.openingMessage?.trim()
  const patch: DeepPartial<BuilderState> = {
    handoff: {
      mode: payload.mode,
      alsoSchedule: payload.alsoSchedule,
      steps,
      departmentName: payload.departmentName,
      departmentType: payload.departmentType,
      members,
      ...(openingMessage ? { openingMessage } : {}),
    },
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'handoff')

  const modeLabel: Record<HandoffPayload['mode'], string> = {
    solo: 'SOLO — o próprio dono atende (o bot pausa e avisa no WhatsApp dele)',
    roleta: 'ROLETA — rodízio entre os membros',
    departamentos:
      'DEPARTAMENTOS — a IA tria por assunto e encaminha ao departamento certo',
    nenhum: 'NENHUM — o agente não passa para humano (só conversa)',
  }
  const hasRoster = payload.mode === 'roleta' || payload.mode === 'departamentos'
  const pairedCount = members.filter((m) => Boolean(m.connectionId)).length
  const rosterNote = hasRoster
    ? ` ${members.length === 1 ? '1 atendente' : `${members.length} atendentes`} no roster${pairedCount > 0 ? ' (alguns com WhatsApp próprio para warm transfer)' : ''}.`
    : ''
  const stepsNote =
    steps.length > 0
      ? ` ${steps.length === 1 ? '1 pergunta' : `${steps.length} perguntas`} de qualificação antes do bastão.`
      : ''
  const scheduleNote = payload.alsoSchedule
    ? ' Também marca na agenda (conecte o calendário no próximo passo).'
    : ''
  return {
    next,
    cardInstruction:
      `O usuário CONFIGUROU a passagem para humano via card: ${modeLabel[payload.mode]}.` +
      `${rosterNote}${stepsNote}${scheduleNote} ` +
      'Siga para o próximo passo; não reabra o card de handoff.',
  }
}
