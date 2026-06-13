/**
 * Builder Module — `silenced_contacts` card application.
 */

import {
  patchBuilderState,
  applyConfirmation,
  type BuilderState,
  type DeepPartial,
} from '../../builder-state'
import type { SilencedContactsPayload } from '../../card-submit.schemas'
import { normalizeWhatsappBr, type CardApplication } from '../apply-card-submit'

/**
 * G1 — re-valida contatos silenciados server-side: normaliza o WhatsApp para
 * E.164-BR (descarta os que não normalizam), faz trim do nome (inclui só se não
 * vazio), dedupe por whatsapp e capa em 50. Nunca confia no body.
 */
function sanitizeSilencedContacts(
  items: SilencedContactsPayload['contacts'],
): SilencedContactsPayload['contacts'] {
  const seen = new Set<string>()
  const out: SilencedContactsPayload['contacts'] = []
  for (const item of items) {
    const whatsapp = normalizeWhatsappBr(item.whatsapp)
    if (!whatsapp || seen.has(whatsapp)) continue
    seen.add(whatsapp)
    const name = item.name?.trim()
    out.push(name && name.length > 0 ? { name, whatsapp } : { whatsapp })
    if (out.length >= 50) break
  }
  return out
}

/**
 * G1 — silenced_contacts: o usuário definiu (ou confirmou que não há) os contatos
 * que o agente NUNCA responde automaticamente. `contacts` é um array → o
 * deepMerge substitui a lista inteira (replace wholesale), que é o comportamento
 * desejado. `acknowledged` é sempre `true` no state (o sentinel real é
 * `confirmations.silencedContacts`, resolvido só aqui via applyConfirmation —
 * nunca lido do body). Passo OPCIONAL: lista vazia é válida.
 */
export function applySilencedContacts(
  state: BuilderState,
  contacts: SilencedContactsPayload['contacts'],
): CardApplication {
  const clean = sanitizeSilencedContacts(contacts)
  const patch: DeepPartial<BuilderState> = {
    silencedContacts: { contacts: clean, acknowledged: true },
  }
  const next = applyConfirmation(
    patchBuilderState(state, patch),
    'silencedContacts',
  )

  const cardInstruction =
    clean.length === 0
      ? 'O usuário confirmou que não há contatos a silenciar — o agente pode responder todos. ' +
        'Siga para o próximo passo da jornada. Não reabra o card de contatos em silêncio.'
      : `O usuário definiu ${clean.length === 1 ? '1 contato' : `${clean.length} contatos`} que o agente NUNCA responde automaticamente (o humano responde essas pessoas no WhatsApp). ` +
        'Respeite esse silêncio no comportamento do agente e siga para o próximo passo. ' +
        'Não reabra o card de contatos em silêncio.'

  return { next, cardInstruction }
}
