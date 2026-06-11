/**
 * Builder Module — Journey v2 card handlers (jornada-builder-v2).
 *
 * The `apply-card-submit.ts` entrypoint has outgrown the 800-line service ceiling
 * (FILE_SIZE_GUIDELINES), so Journey v2 card handlers live HERE — the entrypoint
 * only keeps a <30-line dispatch per card in its switch. Each handler owns its own
 * persistence so the entrypoint stays a thin router (mirrors how `quick_reply_chips`
 * returns early without the generic write).
 *
 * Tenant boundary: EVERY write is filtered by organizationId. No `any`.
 */

import { Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import { trackJourneyEvent } from '@/server/services/journey-events'
import {
  parseBuilderState,
  patchBuilderState,
  applyConfirmation,
  clearCapturedProposals,
  type BuilderState,
  type DeepPartial,
  type ConfirmationKey,
} from '../../builder-state'
import type {
  AgentReviewPayload,
  BusinessIdentityPayload,
} from '../../card-submit.schemas'
import type {
  AgentReviewSectionErrors,
  ApplyCardSubmitResult,
} from '../apply-card-submit'
import { applyAgentPersona } from './persona'
import { applyServices } from './services'
import { applyBusinessHours } from './hours'
import {
  getIdentityCardFromMetadata,
  mergeIdentityCardIntoMetadata,
  normalizeIdentityCard,
  type AgentIdentityCard,
} from '@/lib/agent-identity-card'

/** Clamp a free-text field server-side (trim + max length). `undefined`/empty → undefined. */
function sanitizeText(raw: string | undefined, max: number): string | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim().slice(0, max)
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * T19 (FR-03) — business_identity: o usuário descreveu o negócio SEM colar uma
 * fonte (nome obrigatório + endereço/descrição opcionais). É o caminho equivalente
 * ao accept do `source_progress` (que satisfaz a identidade pelo site/IG): ambos
 * destravam o step `business_identity` da fase Conhecer.
 *
 * Escreve, de forma ATÔMICA e org-scoped (mesmo padrão de
 * `set-project-basics.tool.ts:149-202`):
 *   - `identity.address` / `identity.description` (lar canônico, igual ao accept).
 *   - `project.name` no builderState + espelho em `builder_projects.name` (para a
 *     lista de projetos refletir o nome do negócio).
 * Flipa o sentinel `confirmations.businessIdentity` via `applyConfirmation` e emite
 * o evento de funil `identity_done`. Re-sanitiza tudo server-side (nunca confia no
 * body). Self-contained: o entrypoint só despacha e retorna este resultado.
 */
export async function applyBusinessIdentity(args: {
  conversationId: string
  projectId: string
  organizationId: string
  current: BuilderState
  payload: Pick<BusinessIdentityPayload, 'name' | 'address' | 'description'>
}): Promise<ApplyCardSubmitResult> {
  const { conversationId, projectId, organizationId, current, payload } = args

  const name = sanitizeText(payload.name, 80)
  if (!name) {
    return { ok: false, reason: 'invalid', message: 'Nome do negócio é obrigatório' }
  }
  const address = sanitizeText(payload.address, 300)
  const description = sanitizeText(payload.description, 500)

  // Atomic read-modify-write (re-read the FRESHEST state inside the transaction so
  // a concurrent card submit isn't clobbered) + mirror the name onto the project row.
  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { builderState: true },
    })
    // Fall back to the already-loaded state when the in-transaction read misses
    // (e.g. test doubles) so the handler never silently drops the write.
    const fresh =
      row?.builderState != null ? parseBuilderState(row.builderState) : current

    const patch: DeepPartial<BuilderState> = {
      project: { name },
      // TODO (T06/onda3): quando o namespace `capturedProposals` existir, limpar o
      // domínio de identidade aqui via `clearCapturedProposals(state, ...)` — o
      // deepMerge nunca deleta chaves, então o clear precisa ser explícito.
      ...(address || description
        ? {
            identity: {
              ...(address ? { address } : {}),
              ...(description ? { description } : {}),
            },
          }
        : {}),
    }
    const next = applyConfirmation(patchBuilderState(fresh, patch), 'businessIdentity')

    await tx.builderProjectConversation.updateMany({
      where: { id: conversationId, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })

    // Espelha o nome do negócio em builder_projects.name (org-scoped) para a lista
    // de projetos refletir a identidade.
    await tx.builderProject.updateMany({
      where: { id: projectId, organizationId },
      data: { name },
    })
  })

  // FR-03 — a identidade está satisfeita (sem fonte). Fire-and-forget, nunca lança.
  await trackJourneyEvent({
    organizationId,
    projectId,
    journeyVersion: current.journeyVersion,
    event: 'identity_done',
  })

  const bits: string[] = [`nome "${name}"`]
  if (address) bits.push(`endereço "${address}"`)
  if (description) bits.push('descrição do negócio')

  return {
    ok: true,
    conversationId,
    cardInstruction:
      `O usuário DESCREVEU o negócio via card (${bits.join(', ')}). ` +
      'Esses dados agora fazem parte do contexto do agente. ' +
      'Use-os ao montar o agente e siga para o próximo passo da jornada. ' +
      'Não reabra o card "Sobre o negócio".',
  }
}

/**
 * T31 (plan §3.3) — flip ATÔMICO e org-scoped de um único sentinel server-side
 * para os acks `knowledge`/`media`. Self-contained (igual a `applyBusinessIdentity`):
 * resolve a conversa por `projectId` org-scoped (prova de posse → `not_found` quando
 * não existe), re-lê o estado MAIS recente DENTRO da transação para não atropelar um
 * submit concorrente, flipa o sentinel via `applyConfirmation` (única fonte do flip —
 * nada vem do body) e grava num único `updateMany` filtrado por organizationId.
 *
 * Não emite evento de funil: os passos `knowledge`/`media` são OPCIONAIS e não
 * pertencem ao vocabulário fechado de `trackJourneyEvent`. O router (silent ou
 * conversacional) só despacha e repassa este `ApplyCardSubmitResult`.
 */
async function applySentinelAck(args: {
  projectId: string
  organizationId: string
  sentinel: ConfirmationKey
  cardInstruction: string
}): Promise<ApplyCardSubmitResult> {
  const { projectId, organizationId, sentinel, cardInstruction } = args

  const conversation = await database.builderProjectConversation.findUnique({
    where: { projectId },
    select: { id: true, organizationId: true },
  })
  if (!conversation) {
    return { ok: false, reason: 'not_found', message: 'Conversa do Builder não encontrada' }
  }
  if (conversation.organizationId !== organizationId) {
    return { ok: false, reason: 'forbidden', message: 'Acesso negado a esta conversa' }
  }

  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: conversation.id, organizationId },
      select: { builderState: true },
    })
    // null/garbage/legado → DEFAULT_BUILDER_STATE (parseBuilderState nunca lança).
    const fresh = parseBuilderState(row?.builderState)
    const next = applyConfirmation(fresh, sentinel)

    await tx.builderProjectConversation.updateMany({
      where: { id: conversation.id, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })
  })

  return { ok: true, conversationId: conversation.id, cardInstruction }
}

/**
 * T31 — knowledge ack: o usuário RECONHECEU o passo opcional de base de
 * conhecimento (flipa `confirmations.knowledge`). O passo também é satisfeito por
 * dados reais (fonte/texto ingerido) sem card — este é o caminho "seguir sem anexar".
 */
export async function applyKnowledgeAck(args: {
  projectId: string
  organizationId: string
}): Promise<ApplyCardSubmitResult> {
  return applySentinelAck({
    ...args,
    sentinel: 'knowledge',
    cardInstruction:
      'O usuário reconheceu o passo de base de conhecimento. ' +
      'Considere o conteúdo já anexado (se houver) ao responder e siga para o próximo passo. ' +
      'Não reabra o card de Conhecimento.',
  })
}

/**
 * T31 — media ack: o usuário RECONHECEU o passo opcional de catálogo de mídia
 * (flipa `confirmations.media`). O passo também é satisfeito por dados reais
 * (`imagesCount > 0`) sem card. Mesmo contrato/idiom do `applyKnowledgeAck`.
 */
export async function applyMediaAck(args: {
  projectId: string
  organizationId: string
}): Promise<ApplyCardSubmitResult> {
  return applySentinelAck({
    ...args,
    sentinel: 'media',
    cardInstruction:
      'O usuário reconheceu o passo de catálogo de mídia. ' +
      'Use as fotos/vídeos já cadastrados (se houver) quando fizer sentido e siga para o próximo passo. ' +
      'Não reabra o card de Mídia.',
  })
}

/**
 * FR-22 — valida CADA seção do card composto `agent_review` server-side ANTES de
 * qualquer write. Regra mínima de "revisado o suficiente para confirmar", espelho
 * do que cada card individual carrega quando preenchido de verdade:
 *   - persona: ao menos um campo com texto (nome/tom/estilo/saudação).
 *   - services: ao menos um serviço OFERECIDO (o "não oferece" é só complemento).
 *   - hours: um preset OU um schedule não-vazio (o default "sempre aberto" vive no
 *     componente — o body sempre chega com algo a confirmar).
 * Retorna `undefined` quando todas passam; caso contrário um objeto granular SÓ
 * com as seções que falharam (nunca um erro monolítico). Pura, sem IO.
 */
function validateAgentReviewSections(
  payload: AgentReviewPayload,
): AgentReviewSectionErrors | undefined {
  const errors: AgentReviewSectionErrors = {}

  const personaFilled = [
    payload.persona.name,
    payload.persona.tone,
    payload.persona.style,
    payload.persona.greeting,
  ].some((v) => typeof v === 'string' && v.trim().length > 0)
  if (!personaFilled) {
    errors.persona =
      'Defina ao menos um detalhe da persona (nome, tom, estilo ou saudação).'
  }

  const hasOffered = payload.offered.some((s) => s.trim().length > 0)
  if (!hasOffered) {
    errors.services = 'Informe ao menos um serviço que o negócio oferece.'
  }

  const hasPreset =
    typeof payload.preset === 'string' && payload.preset.trim().length > 0
  const hasSchedule =
    payload.schedule !== undefined &&
    payload.schedule !== null &&
    !(Array.isArray(payload.schedule) && payload.schedule.length === 0) &&
    !(
      typeof payload.schedule === 'object' &&
      !Array.isArray(payload.schedule) &&
      Object.keys(payload.schedule as Record<string, unknown>).length === 0
    )
  if (!hasPreset && !hasSchedule) {
    errors.hours = 'Defina o horário de atendimento (preset ou agenda manual).'
  }

  return Object.keys(errors).length > 0 ? errors : undefined
}

/**
 * T24 (FR-05/FR-22) — agent_review: card COMPOSTO da fase Revisar. Funde persona +
 * serviços + horários numa ÚNICA confirmação consolidada (NFR-07: 1 decisão, 1 ACK
 * em vez de 3) e, opcionalmente, aplica o disclosure (seção avançada — antiga
 * IdentityTab) no MESMO handler.
 *
 * Fluxo:
 *  1. VALIDAÇÃO GRANULAR (FR-22) — antes de qualquer escrita. Em falha de uma
 *     seção, retorna `{ errors: { persona?, services?, hours? } }` SEM nenhum write
 *     parcial; o client preserva o estado local das seções válidas (T43).
 *  2. Compõe os exports PUROS de `apply/{persona,services,hours}.ts` num único
 *     state encadeado (cada um flipa seu sentinel) e LIMPA explicitamente
 *     `capturedProposals.{persona,services,hours}` via `clearCapturedProposals`
 *     (o deepMerge nunca deleta — o clear precisa ser explícito).
 *  3. Persiste em UM `updateMany` org-scoped (3 sentinels num só write) e, quando
 *     há `disclosure`, aplica `normalizeIdentityCard`+`mergeIdentityCardIntoMetadata`
 *     sobre `BuilderProject.metadata.identityCard` na MESMA transação — 1 POST real,
 *     sem segundo request ao PATCH /builder/identity. A injeção no prompt acontece
 *     depois, no `create_agent` (o agente ainda não existe no agent_review).
 *  4. Emite `review_done` (funil), fire-and-forget.
 * Re-lê o state FRESCO dentro da transação (igual a `applyBusinessIdentity`) para
 * não atropelar um submit concorrente. Org-scoped em TODO write. No `any`.
 */
export async function applyAgentReview(args: {
  conversationId: string
  projectId: string
  organizationId: string
  current: BuilderState
  payload: AgentReviewPayload
}): Promise<ApplyCardSubmitResult> {
  const { conversationId, projectId, organizationId, current, payload } = args

  // 1. FR-22 — validação granular ANTES de qualquer escrita.
  const errors = validateAgentReviewSections(payload)
  if (errors) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'Revise as seções destacadas antes de confirmar.',
      errors,
    }
  }

  // O bloco de disclosure (opcional) só é aplicado quando o usuário abriu a seção
  // avançada — fora dela, `metadata.identityCard` permanece intocado.
  const disclosure = payload.disclosure

  // 2 + 3. Read-modify-write atômico org-scoped: compõe os 3 cards num único state
  // (cada export puro flipa seu sentinel), limpa as propostas capturadas e grava
  // tudo num só `updateMany`. O disclosure (quando presente) vai no metadata do
  // projeto NA MESMA transação (1 POST real).
  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { builderState: true },
    })
    const fresh =
      row?.builderState != null ? parseBuilderState(row.builderState) : current

    // Encadeia os exports puros: cada um aplica seus campos OWNED + flipa o
    // sentinel da sua seção sobre o state do anterior (1 state final, 3 flips).
    let next = applyAgentPersona(fresh, payload.persona).next
    next = applyServices(next, {
      offered: payload.offered,
      notOffered: payload.notOffered,
    }).next
    next = applyBusinessHours(next, {
      preset: payload.preset,
      schedule: payload.schedule,
      timezone: payload.timezone,
      outOfHours: payload.outOfHours,
    }).next

    // Clear EXPLÍCITO das propostas capturadas dos 3 domínios (o deepMerge nunca
    // deleta chaves — confiar no patch deixaria a proposta zumbi no JSONB).
    next = clearCapturedProposals(next, 'persona')
    next = clearCapturedProposals(next, 'services')
    next = clearCapturedProposals(next, 'hours')

    await tx.builderProjectConversation.updateMany({
      where: { id: conversationId, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })

    // Disclosure (seção avançada) → BuilderProject.metadata.identityCard, na MESMA
    // transação. Normaliza o card sobre o metadata atual (merge parcial), sem 2º
    // request ao PATCH /builder/identity. Org-scoped via updateMany.
    if (disclosure) {
      const project = await tx.builderProject.findFirst({
        where: { id: projectId, organizationId },
        select: { metadata: true },
      })
      // Merge parcial: parte do card atual (normalizado) e sobrescreve SÓ os
      // campos de disclosure escolhidos no card composto.
      const merged: AgentIdentityCard = normalizeIdentityCard({
        ...getIdentityCardFromMetadata(project?.metadata),
        disclosureMode: disclosure.mode,
        disclosureCustomText: disclosure.customText,
      })
      await tx.builderProject.updateMany({
        where: { id: projectId, organizationId },
        data: {
          metadata: mergeIdentityCardIntoMetadata(
            project?.metadata,
            merged,
          ) as unknown as Prisma.InputJsonValue,
        },
      })
    }
  })

  // 4. Funil — a revisão consolidada foi confirmada. Fire-and-forget, nunca lança.
  await trackJourneyEvent({
    organizationId,
    projectId,
    journeyVersion: current.journeyVersion,
    event: 'review_done',
  })

  const disclosureNote = disclosure
    ? disclosure.mode === 'human_passthrough'
      ? ' Identidade: o agente se apresenta de forma humanizada (sem afirmar ser humano se perguntado).'
      : disclosure.mode === 'custom'
        ? ' Identidade: texto de apresentação personalizado definido.'
        : ' Identidade: o agente assume com naturalidade ser uma IA.'
    : ''

  return {
    ok: true,
    conversationId,
    cardInstruction:
      'O usuário CONFIRMOU a revisão consolidada do agente via card (persona, serviços e horário de atendimento).' +
      `${disclosureNote} ` +
      'Esses dados já estão no contexto do agente — não reabra os cards de persona, serviços ou horários. ' +
      'Prossiga para a aprovação/criação do agente e siga para o próximo passo da jornada.',
  }
}
