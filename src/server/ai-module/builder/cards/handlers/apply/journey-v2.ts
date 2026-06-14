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
  invalidateRefinement,
  type BuilderState,
  type DeepPartial,
  type ConfirmationKey,
} from '../../builder-state'
import type {
  AgentReviewPayload,
  BuildModePayload,
  BusinessIdentityPayload,
  ChannelPlatformPayload,
  ConversationBlueprintPayload,
  MissionPayload,
  ProactivePayload,
  QualificationPayload,
  RestrictionsPayload,
  TestDrivePayload,
} from '../../card-submit.schemas'
import { channelPlatformWhatsappModeOk } from '../../card-submit.schemas'
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
import {
  blueprintHasBlockingIssues,
  normalizeConversationBlueprint,
  validateConversationBlueprint,
} from '../../../playbook/blueprint-helpers'
import {
  buildDesignerInput,
  hasSoldOutSourceSignal,
  soldOutStrategyKnownLimit,
} from '../../../playbook/designer-input'
import { playbookDesignerSubAgent } from '../../../sub-agents'
import { runResearchModeDiagnosisReal } from '../../../research/research-mode-diagnosis.service'

/** Clamp a free-text field server-side (trim + max length). `undefined`/empty → undefined. */
function sanitizeText(raw: string | undefined, max: number): string | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim().slice(0, max)
  return trimmed.length > 0 ? trimmed : undefined
}

/** Compact a list for an approved proposal description. */
function summarizeList(items: readonly string[], fallback: string): string {
  const clean = items
    .map((item) => sanitizeText(item, 90))
    .filter((item): item is string => item !== undefined)
  if (clean.length === 0) return fallback
  const head = clean.slice(0, 3).join(', ')
  const extra = clean.length > 3 ? ` e mais ${clean.length - 3}` : ''
  return `${head}${extra}`
}

type ConversationBlueprintContextDecision = NonNullable<
  ConversationBlueprintPayload['contextDecision']
>

/** A estratégia de esgotado normalizada, vinda do state OU do contextDecision inline. */
type ResolvedSoldOut = {
  strategy: ConversationBlueprintContextDecision['strategy']
  note?: string
}

/**
 * FR-44 (backlog #3) — resolve a decisão de esgotado a aplicar no plano de
 * atendimento, com PRECEDÊNCIA para o passo `restrictions` da fase Revisar (v3,
 * gravado no state ANTES do plano). Quando ausente, cai para o `contextDecision`
 * inline (v2 — backward-compatible). Retorna `undefined` quando NENHUMA das duas
 * fontes carrega a decisão.
 */
function resolveSoldOutDecision(
  state: BuilderState,
  contextDecision: ConversationBlueprintContextDecision | undefined,
): ResolvedSoldOut | undefined {
  const stateStrategy = state.restrictions?.soldOutStrategy
  if (stateStrategy) {
    const note = sanitizeText(state.restrictions?.note, 300)
    return { strategy: stateStrategy, ...(note ? { note } : {}) }
  }
  if (contextDecision?.kind === 'sold_out') {
    return { strategy: contextDecision.strategy, note: contextDecision.note }
  }
  return undefined
}

function soldOutDecisionLabel(
  decision: ResolvedSoldOut | undefined,
): string | undefined {
  if (!decision) return undefined
  if (decision.strategy === 'interest_list') return 'lista de interesse/alternativas'
  if (decision.strategy === 'human_confirm') return 'confirmar disponibilidade com humano'
  return 'disponibilidade confirmada pelo usuário'
}

function appendRequiredDontRule(
  rules: readonly string[],
  requiredRule: string | undefined,
): string[] {
  if (!requiredRule) return [...rules]
  const normalized = requiredRule.trim().toLowerCase()
  const withoutDuplicate = rules.filter(
    (rule) => rule.trim().toLowerCase() !== normalized,
  )
  return [...withoutDuplicate.slice(0, 19), requiredRule]
}

/**
 * Derive the proposal stamped by the final review card. This replaces the old v2
 * dependency on a separate `propose_agent_creation` card: if the LLM already
 * proposed a name/description we preserve them; otherwise we create a conservative
 * summary from the reviewed state.
 */
function deriveApprovedAgentProposal(state: BuilderState): {
  name: string
  description: string
} {
  const businessName =
    sanitizeText(state.project.name, 80) ??
    sanitizeText(state.sourceIngestion.proposed?.businessName, 80) ??
    'seu negócio'
  const name =
    sanitizeText(state.proposal.name, 100) ??
    sanitizeText(state.persona.name, 100) ??
    `SDR ${businessName}`
  const objective =
    sanitizeText(state.project.objective, 180) ??
    'captar e qualificar leads pelo WhatsApp'
  const tone = sanitizeText(state.persona.tone, 120) ?? 'consultivo e direto'
  const scope = summarizeList(state.services.offered, 'as principais dúvidas')
  const description =
    sanitizeText(state.proposal.description, 800) ??
    `Atende leads pelo WhatsApp para ${objective}. Responde sobre ${scope}, conduz a conversa com tom ${tone} e encaminha oportunidades para a equipe quando fizer sentido.`

  return { name, description }
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
    const next = invalidateRefinement(
      applyConfirmation(patchBuilderState(fresh, patch), 'businessIdentity'),
      'O card business_identity alterou a identidade testada pelo refinamento.',
    )

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
 * Mapeia a `role` (string livre do card) para o enum FECHADO do funil
 * (`mission_selected.role`). Retorna `undefined` quando não casa — o evento então
 * OMITE a chave (NFR-02: sem free-text/PII no metadata do funil).
 */
const MISSION_ROLE_ENUM = [
  'sdr',
  'closer',
  'secretaria',
  'suporte',
  'vendas',
  'cobranca',
  'onboarding',
] as const
type MissionRoleEnum = (typeof MISSION_ROLE_ENUM)[number]
function toMissionRoleEnum(raw: string | undefined): MissionRoleEnum | undefined {
  if (!raw) return undefined
  const v = raw.trim().toLowerCase()
  return (MISSION_ROLE_ENUM as readonly string[]).includes(v)
    ? (v as MissionRoleEnum)
    : undefined
}

/**
 * Mapeia o `objective` (string livre do card) para o enum FECHADO do funil
 * (`mission_selected.objectiveKind`). `undefined` quando não casa — chave omitida.
 */
const MISSION_OBJECTIVE_ENUM = [
  'qualificar',
  'agendar',
  'vender',
  'suportar',
  'transferir',
] as const
type MissionObjectiveEnum = (typeof MISSION_OBJECTIVE_ENUM)[number]
function toMissionObjectiveEnum(
  raw: string | undefined,
): MissionObjectiveEnum | undefined {
  if (!raw) return undefined
  const v = raw.trim().toLowerCase()
  return (MISSION_OBJECTIVE_ENUM as readonly string[]).includes(v)
    ? (v as MissionObjectiveEnum)
    : undefined
}

/**
 * T117 (mission-first v3 — FR-37/FR-48) — mission: o usuário escolheu a MISSÃO do
 * agente numa única decisão. Espelho FIEL de `applyBusinessIdentity` (tx atômica
 * org-scoped, re-read FRESCO, applyConfirmation, invalidateRefinement, evento
 * DEPOIS do write), mas grava o subtree `mission` CRU (não `patchBuilderState`).
 * `role`/`objective` (strings do card) são mapeados para os enums quando válidos,
 * senão omitidos (NFR-02: sem free-text/PII no funil). Self-contained.
 */
export async function applyMission(args: {
  conversationId: string
  projectId: string
  organizationId: string
  current: BuilderState
  payload: Pick<
    MissionPayload,
    'key' | 'label' | 'role' | 'objective' | 'addons' | 'custom'
  >
}): Promise<ApplyCardSubmitResult> {
  const { conversationId, projectId, organizationId, current, payload } = args

  // NFR-12 hardening: o passo Missão só existe em projetos mission-first. Rejeita
  // um POST forjado a um projeto v2 puro (onde o engine nem surfa o passo).
  if (current.missionFirst !== true) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'O passo de missão não se aplica a este projeto.',
    }
  }

  const key = sanitizeText(payload.key, 120)
  if (!key) {
    return { ok: false, reason: 'invalid', message: 'Missão é obrigatória' }
  }
  const label = sanitizeText(payload.label, 160)
  const role = sanitizeText(payload.role, 60)
  const objective = sanitizeText(payload.objective, 60)
  // Re-trim/dedupe/clamp dos add-ons server-side (nunca confia no body).
  const addons = Array.from(
    new Set(
      payload.addons
        .map((item) => sanitizeText(item, 60))
        .filter((item): item is string => item !== undefined),
    ),
  ).slice(0, 12)
  const custom = payload.custom === true

  // Atomic read-modify-write: re-lê o state MAIS recente dentro da transação
  // (fallback ao `current` quando o read in-tx erra — test doubles) e substitui
  // o subtree `mission` INTEIRO. Diferente de `applyBusinessIdentity` (que usa
  // patchBuilderState/deep-merge): o deep-merge preservaria `addons`/`role` antigos
  // ao TROCAR de missão, então gravamos o subtree cru. (Mesmo racional de applyChannelPlatform.)
  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { builderState: true },
    })
    const fresh =
      row?.builderState != null ? parseBuilderState(row.builderState) : current

    const withMission: BuilderState = {
      ...fresh,
      mission: {
        key,
        ...(label ? { label } : {}),
        ...(role ? { role } : {}),
        ...(objective ? { objective } : {}),
        addons,
        custom,
      },
    }
    const next = invalidateRefinement(
      applyConfirmation(withMission, 'mission'),
      'O card mission alterou a missão testada pelo refinamento.',
    )

    await tx.builderProjectConversation.updateMany({
      where: { id: conversationId, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })
  })

  // FR-48 — a missão foi escolhida. Fire-and-forget, nunca lança. Metadata FECHADO:
  // só os enums casados entram (strings free-text/PII NUNCA vão para o funil).
  const roleEnum = toMissionRoleEnum(role)
  const objectiveKind = toMissionObjectiveEnum(objective)
  await trackJourneyEvent({
    organizationId,
    projectId,
    journeyVersion: current.journeyVersion,
    event: 'mission_selected',
    ...(roleEnum || objectiveKind
      ? {
          metadata: {
            ...(roleEnum ? { role: roleEnum } : {}),
            ...(objectiveKind ? { objectiveKind } : {}),
          },
        }
      : {}),
  })

  const missionLabel = label ?? key
  const addonNote =
    addons.length > 0 ? ` Capacidades extras ligadas: ${addons.join(', ')}.` : ''
  return {
    ok: true,
    conversationId,
    cardInstruction:
      `O usuário ESCOLHEU a missão do agente via card: "${missionLabel}".` +
      addonNote +
      ' Essa missão define o foco do agente e já faz parte do contexto. ' +
      'Use-a ao montar o agente e siga para o próximo passo da jornada. ' +
      'Não reabra o card de Missão.',
  }
}

/** Rótulo humano (linguagem de negócio, FR-49) de cada modo de construção. */
const BUILD_MODE_LABELS: Record<BuildModePayload['mode'], string> = {
  recomendado: 'Montar direto com boas práticas',
  pesquisa: 'Pesquisar antes de sugerir',
  livre: 'Quero orientar a montagem',
}

/**
 * FR-39 (mission-first v3) — build_mode: o usuário escolheu COMO quer construir o
 * agente numa única decisão. Espelho MAIS LEVE de `applyMission` (tx atômica
 * org-scoped, re-read FRESCO, applyConfirmation, invalidateRefinement), mas grava
 * apenas o escalar top-level `buildMode` (via `patchBuilderState` — last-write-wins
 * em escalar é seguro) e NÃO emite evento de funil (`build_mode` não pertence ao
 * vocabulário fechado de `trackJourneyEvent`). Self-contained.
 */
export async function applyBuildMode(args: {
  conversationId: string
  projectId: string
  organizationId: string
  current: BuilderState
  payload: Pick<BuildModePayload, 'mode'>
}): Promise<ApplyCardSubmitResult> {
  const { conversationId, projectId, organizationId, current, payload } = args
  const mode = payload.mode

  // NFR-12 hardening: o passo Modo de construção só existe em projetos mission-first.
  if (current.missionFirst !== true) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'O passo de modo de construção não se aplica a este projeto.',
    }
  }

  // Atomic read-modify-write: re-lê o state MAIS recente dentro da transação
  // (fallback ao `current` quando o read in-tx erra — test doubles), grava o
  // escalar `buildMode` e flipa o sentinel num único `updateMany` org-scoped.
  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { builderState: true },
    })
    const fresh =
      row?.builderState != null ? parseBuilderState(row.builderState) : current

    const next = invalidateRefinement(
      applyConfirmation(patchBuilderState(fresh, { buildMode: mode }), 'buildMode'),
      'O card build_mode alterou o modo de construção testado pelo refinamento.',
    )

    await tx.builderProjectConversation.updateMany({
      where: { id: conversationId, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })
  })

  // FR-46/FR-47 (F5+) — Modo Pesquisa DETERMINÍSTICO + Motor de Estratégia: ao
  // escolher 'pesquisa', o PRODUTO dispara aqui (não a discrição do LLM) a pesquisa
  // de nicho E o motor de estratégia, persistindo `diagnosisInsights` + `strategyDiagnosis`
  // para o card `diagnosis` renderizar evidências E a estratégia (campos a qualificar,
  // o que não perguntar, crítica). FAIL-OPEN (FR-47): NUNCA bloqueia o submit. A
  // ESTRATÉGIA é determinística e persiste mesmo se a pesquisa de nicho falhar.
  // Guard de idempotência por `strategyDiagnosis` (re-submit não re-paga Tavily+LLM).
  let researchNote = ''
  if (mode === 'pesquisa' && !current.strategyDiagnosis) {
    try {
      const research = await runResearchModeDiagnosisReal({
        projectId,
        organizationId,
      })
      if (research.ran && research.researchOk) {
        researchNote = research.lite
          ? ' Preparei um diagnóstico (pesquisa lite, sem fontes externas agora) e a estratégia de qualificação para o próximo passo.'
          : ' Preparei um diagnóstico com referências e a estratégia de qualificação para o próximo passo.'
      } else if (research.ran) {
        researchNote =
          ' Preparei a estratégia de qualificação do negócio para o próximo passo (pesquisa externa indisponível agora).'
      }
    } catch {
      // Fail-open redundante: runResearchModeDiagnosisReal já nunca lança.
    }
  }

  return {
    ok: true,
    conversationId,
    cardInstruction:
      `O usuário ESCOLHEU o modo de construção via card: "${BUILD_MODE_LABELS[mode]}".` +
      researchNote +
      ' Adapte sua abordagem nos próximos passos a essa preferência ' +
      '(recomendado = montar direto com boas práticas; pesquisa = trazer referências antes; ' +
      'livre = deixar o usuário ditar como o agente trabalha) e siga para o próximo passo da jornada. ' +
      'Não reabra o card de modo de construção.',
  }
}

/**
 * FR-44 (critérios de qualificação — backlog #10) — qualification: o usuário
 * escolheu (multi-seleção) QUAIS dados o agente coleta de cada contato para
 * considerar o atendimento bom. Espelho FIEL de `applyBuildMode`/`applyMission`
 * (tx atômica org-scoped, re-read FRESCO, applyConfirmation, invalidateRefinement),
 * mas grava o subtree `qualification` CRU (não `patchBuilderState`): o subtree é uma
 * LISTA, e o deep-merge preservaria campos antigos ao trocar a seleção, então
 * substituímos o subtree inteiro (mesmo racional de applyMission/applyChannelPlatform).
 * NÃO emite evento de funil (`qualification` não pertence ao vocabulário fechado de
 * `trackJourneyEvent`). Self-contained.
 */
export async function applyQualification(args: {
  conversationId: string
  projectId: string
  organizationId: string
  current: BuilderState
  payload: Pick<QualificationPayload, 'fields'>
}): Promise<ApplyCardSubmitResult> {
  const { conversationId, organizationId, current, payload } = args

  // NFR-12 hardening: o passo de qualificação só existe em projetos mission-first
  // (o engine v2 só o surfa quando `missionFirst === true`). Rejeita um POST forjado
  // a um projeto v2 puro (onde o engine nem surfa o passo).
  if (current.missionFirst !== true) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'O passo de critérios de qualificação não se aplica a este projeto.',
    }
  }

  // Re-trim/dedupe/clamp dos campos server-side (nunca confia no body), cap 24.
  const fields = Array.from(
    new Set(
      payload.fields
        .map((item) => sanitizeText(item, 120))
        .filter((item): item is string => item !== undefined),
    ),
  ).slice(0, 24)

  // Atomic read-modify-write: re-lê o state MAIS recente dentro da transação
  // (fallback ao `current` quando o read in-tx erra — test doubles) e substitui o
  // subtree `qualification` INTEIRO (lista → last-write-wins, não deep-merge).
  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { builderState: true },
    })
    const fresh =
      row?.builderState != null ? parseBuilderState(row.builderState) : current

    const withQualification: BuilderState = {
      ...fresh,
      qualification: { fields },
    }
    const next = invalidateRefinement(
      applyConfirmation(withQualification, 'qualification'),
      'O card qualification alterou os critérios testados pelo refinamento.',
    )

    await tx.builderProjectConversation.updateMany({
      where: { id: conversationId, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })
  })

  const fieldNote =
    fields.length > 0
      ? `Dados a coletar: ${fields.join(', ')}.`
      : 'O usuário optou por não definir critérios obrigatórios de qualificação.'
  return {
    ok: true,
    conversationId,
    cardInstruction:
      `O usuário DEFINIU os critérios de qualificação via card. ${fieldNote} ` +
      'Use esses critérios ao montar o plano de atendimento (o agente coleta esses dados antes de qualificar o contato) e siga para o próximo passo da jornada. ' +
      'Não reabra o card de critérios de qualificação.',
  }
}

/** Rótulo humano (linguagem de negócio, FR-49) de cada estratégia de esgotado. */
const SOLD_OUT_STRATEGY_LABELS: Record<
  RestrictionsPayload['soldOutStrategy'],
  string
> = {
  interest_list: 'captar lista de interesse/alternativas',
  human_confirm: 'confirmar disponibilidade com consultor',
  available_confirmed: 'usar disponibilidade confirmada pelo usuário',
}

/**
 * FR-44 (restrições comerciais — backlog #3) — restrictions: o usuário escolheu COMO
 * o agente trata uma fonte 100% vendida/esgotada. Espelho FIEL de
 * `applyQualification`/`applyMission` (tx atômica org-scoped, re-read FRESCO,
 * applyConfirmation, invalidateRefinement), gravando o subtree `restrictions` CRU
 * (não `patchBuilderState`): ao trocar a estratégia, o deep-merge preservaria a `note`
 * antiga, então substituímos o subtree inteiro. NÃO emite evento de funil
 * (`restrictions` não pertence ao vocabulário fechado de `trackJourneyEvent`).
 * Self-contained. A decisão gravada aqui também destrava o gate do
 * `conversation_blueprint` (substitui o `contextDecision` inline da v2 — backward-compatible).
 */
export async function applyRestrictions(args: {
  conversationId: string
  projectId: string
  organizationId: string
  current: BuilderState
  payload: Pick<RestrictionsPayload, 'soldOutStrategy' | 'note'>
}): Promise<ApplyCardSubmitResult> {
  const { conversationId, organizationId, current, payload } = args

  // NFR-12 hardening: o passo de restrições só existe em projetos mission-first
  // (o engine v2 só o surfa quando `missionFirst === true` e a fonte sinaliza
  // esgotado). Rejeita um POST forjado a um projeto v2 puro.
  if (current.missionFirst !== true) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'O passo de restrições comerciais não se aplica a este projeto.',
    }
  }

  const soldOutStrategy = payload.soldOutStrategy
  const note = sanitizeText(payload.note, 300)

  // Atomic read-modify-write: re-lê o state MAIS recente dentro da transação
  // (fallback ao `current` quando o read in-tx erra — test doubles) e substitui o
  // subtree `restrictions` INTEIRO (escalar+nota → last-write-wins, não deep-merge).
  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { builderState: true },
    })
    const fresh =
      row?.builderState != null ? parseBuilderState(row.builderState) : current

    const withRestrictions: BuilderState = {
      ...fresh,
      restrictions: {
        soldOutStrategy,
        ...(note ? { note } : {}),
      },
    }
    const next = invalidateRefinement(
      applyConfirmation(withRestrictions, 'restrictions'),
      'O card restrictions alterou as restrições testadas pelo refinamento.',
    )

    await tx.builderProjectConversation.updateMany({
      where: { id: conversationId, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })
  })

  const noteNote = note ? ` Observação do usuário: ${note}.` : ''
  return {
    ok: true,
    conversationId,
    cardInstruction:
      `O usuário DEFINIU a restrição comercial via card: ${SOLD_OUT_STRATEGY_LABELS[soldOutStrategy]}.` +
      noteNote +
      ' Essa direção já faz parte do contexto do agente — use-a ao montar o plano de atendimento ' +
      '(não prometa disponibilidade/preço/visita fora do que a estratégia permite) e siga para o próximo passo da jornada. ' +
      'Não reabra o card de restrições comerciais.',
  }
}

/**
 * Builder Playbook — conversation_blueprint: gera uma proposta de roteiro a
 * partir do estado já coletado. Este caminho é acionado pelo próprio card quando
 * o active-step aparece vazio, para não depender do LLM lembrar de chamar a tool
 * `generate_conversation_blueprint`.
 *
 * Grava somente `status: proposed`; a aprovação continua sendo uma ação humana
 * explícita no mesmo card.
 */
export async function generateConversationBlueprintFromCard(args: {
  conversationId: string
  projectId: string
  organizationId: string
  userId?: string
  current: BuilderState
  contextDecision?: ConversationBlueprintContextDecision
}): Promise<ApplyCardSubmitResult> {
  const {
    conversationId,
    projectId,
    organizationId,
    userId,
    current,
    contextDecision,
  } = args

  // FR-44 (backlog #3) — a decisão de esgotado pode vir do passo `restrictions`
  // (v3, gravado no state ANTES do plano) OU do `contextDecision` inline (v2). Se a
  // v3 já decidiu no state, NÃO exigimos o contextDecision (backward-compatible: a
  // v2 segue funcionando pelo contextDecision).
  const resolvedSoldOut = resolveSoldOutDecision(current, contextDecision)
  if (hasSoldOutSourceSignal(current) && resolvedSoldOut === undefined) {
    return {
      ok: false,
      reason: 'invalid',
      message:
        'A fonte indica que o empreendimento está 100% vendido/esgotado. Escolha no card como o agente deve tratar essa restrição antes de gerar o plano de atendimento.',
    }
  }

  const decisionLimit = resolvedSoldOut
    ? soldOutStrategyKnownLimit(resolvedSoldOut.strategy, resolvedSoldOut.note)
    : undefined
  const designerInput = buildDesignerInput(current, {
    extraKnownLimits: decisionLimit ? [decisionLimit] : [],
  })
  if (!designerInput) {
    return {
      ok: false,
      reason: 'invalid',
      message:
        'Defina primeiro o objetivo do agente antes de gerar o plano de atendimento.',
    }
  }

  const designed = await playbookDesignerSubAgent.run(designerInput, {
    organizationId,
    userId: userId ?? 'system',
    projectId,
  })
  if (!designed.success) {
    return {
      ok: false,
      reason: 'invalid',
      message: designed.error,
    }
  }

  const blueprint = normalizeConversationBlueprint({
    ...designed.data.blueprint,
    status: 'proposed',
    objective: designerInput.objective,
    niche: designerInput.niche,
  })
  const issues = validateConversationBlueprint(blueprint)

  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { builderState: true },
    })
    const fresh =
      row?.builderState != null ? parseBuilderState(row.builderState) : current
    const next = invalidateRefinement(
      patchBuilderState(fresh, {
        conversationBlueprint: blueprint,
      }),
      'Uma nova proposta de plano de atendimento foi gerada depois do refinamento.',
    )

    await tx.builderProjectConversation.updateMany({
      where: { id: conversationId, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })
  })

  const warnings = [...designed.data.warnings, ...issues.map((i) => i.message)]
  const decisionLabel = soldOutDecisionLabel(resolvedSoldOut)
  return {
    ok: true,
    conversationId,
    cardInstruction:
      `O plano de atendimento foi GERADO via card (${blueprint.stages.length} etapa(s), ${blueprint.questions.length} pergunta(s)). ` +
      (decisionLabel
        ? `Restrição crítica resolvida pelo usuário: ${decisionLabel}. `
        : '') +
      (warnings.length > 0 ? `Avisos: ${warnings.join(' ')} ` : '') +
      'Mostre o card conversation_blueprint para revisão e aguarde o usuário aprovar; não gere o prompt final antes da aprovação.',
  }
}

/**
 * Builder Playbook — conversation_blueprint: aprova o roteiro conversacional
 * proposto/editado pelo usuário. Sem sentinel novo: o engine v2 considera o
 * passo concluído quando `conversationBlueprint.status === 'approved'`.
 */
export async function applyConversationBlueprint(args: {
  conversationId: string
  organizationId: string
  current: BuilderState
  payload: {
    blueprint: NonNullable<ConversationBlueprintPayload['blueprint']>
    contextDecision?: ConversationBlueprintContextDecision
  }
}): Promise<ApplyCardSubmitResult> {
  const { conversationId, organizationId, current, payload } = args

  // FR-44 (backlog #3) — a decisão de esgotado pode vir do passo `restrictions`
  // (v3, gravado no state) OU do `contextDecision` inline (v2). Se a v3 já decidiu,
  // NÃO exigimos o contextDecision (backward-compatible).
  const resolvedSoldOut = resolveSoldOutDecision(current, payload.contextDecision)
  if (hasSoldOutSourceSignal(current) && resolvedSoldOut === undefined) {
    return {
      ok: false,
      reason: 'invalid',
      message:
        'A fonte indica que o empreendimento está 100% vendido/esgotado. Escolha no card como o agente deve tratar essa restrição antes de aprovar o plano de atendimento.',
    }
  }

  const decisionLimit = resolvedSoldOut
    ? soldOutStrategyKnownLimit(resolvedSoldOut.strategy, resolvedSoldOut.note)
    : undefined

  const approved = normalizeConversationBlueprint({
    ...payload.blueprint,
    dontRules: appendRequiredDontRule(payload.blueprint.dontRules, decisionLimit),
    status: 'approved',
    approvedAt: new Date().toISOString(),
  })
  const issues = validateConversationBlueprint(approved)
  if (blueprintHasBlockingIssues(issues)) {
    return {
      ok: false,
      reason: 'invalid',
      message: issues.map((issue) => issue.message).join(' '),
    }
  }

  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { builderState: true },
    })
    const fresh =
      row?.builderState != null ? parseBuilderState(row.builderState) : current
    const next = invalidateRefinement(
      patchBuilderState(fresh, {
        conversationBlueprint: approved,
      }),
      'O plano de atendimento mudou depois do refinamento.',
    )

    await tx.builderProjectConversation.updateMany({
      where: { id: conversationId, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })
  })

  const toolCount = approved.toolTriggers.filter((trigger) => trigger.active).length
  const handoffCount = approved.handoffTriggers.length
  const decisionLabel = soldOutDecisionLabel(resolvedSoldOut)
  const receiptParts = [
    `${approved.questions.length} pergunta(s)`,
    `${approved.stages.length} etapa(s)`,
    ...(handoffCount > 0 ? [`${handoffCount} gatilho(s) de humano`] : []),
    ...(toolCount > 0 ? [`${toolCount} ferramenta(s) prevista(s)`] : []),
  ]
  return {
    ok: true,
    conversationId,
    cardInstruction:
      `O usuário APROVOU o plano de atendimento via card (${receiptParts.join(', ')}). ` +
      (decisionLabel
        ? `Restrição crítica resolvida pelo usuário: ${decisionLabel}. `
        : '') +
      'Use este ConversationBlueprint como contrato para gerar o prompt final: preserve as perguntas, regras de pulo, critérios, limites e gatilhos. ' +
      'Agora prossiga para gerar o prompt com generate_prompt_anatomy; não reabra o card de plano de atendimento.',
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
  invalidationReason?: string
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
    const confirmed = applyConfirmation(fresh, sentinel)
    const next = args.invalidationReason
      ? invalidateRefinement(confirmed, args.invalidationReason)
      : confirmed

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
    invalidationReason:
      'O passo knowledge alterou o contexto de conhecimento testado pelo refinamento.',
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
    invalidationReason:
      'O passo media alterou o contexto de mídia testado pelo refinamento.',
    cardInstruction:
      'O usuário reconheceu o passo de catálogo de mídia. ' +
      'Use as fotos/vídeos já cadastrados (se houver) quando fizer sentido e siga para o próximo passo. ' +
      'Não reabra o card de Mídia.',
  })
}

/**
 * FR-PRO-01 (F1 — Mensagens proativas / Automações, design-time) — applyProactive:
 * persiste o toggle SILENCIOSO da CAPACIDADE "Mensagens proativas" da seção
 * Capacidades (FR-43). É uma CAPACIDADE, NÃO um passo de jornada: grava o subtree
 * `builderState.proactive.{followUp,reminders,importantDates}` e NÃO flipa nenhum
 * sentinel nem emite evento de funil (não pertence ao vocabulário fechado de
 * `trackJourneyEvent`, e os 3 presets não gateiam a jornada nem o deploy).
 *
 * Self-contained (mesmo idiom de `applySentinelAck`): resolve a posse da conversa
 * pelo `projectId @unique` (prova de tenant → not_found/forbidden) ANTES da
 * transação; dentro da tx re-lê o estado MAIS recente (para não atropelar um submit
 * concorrente) e SUBSTITUI o subtree `proactive` INTEIRO (last-write-wins: o
 * deep-merge preservaria flags antigas, então gravamos cru — mesmo racional de
 * applyChannelPlatform/applyRestrictions). Invalida o refinamento (uma capacidade
 * mudou o que foi testado). F1 só persiste — NENHUM envio (runtime F2-F4 é épico
 * próprio). Org-scoped em TODO write. No `any`.
 */
export async function applyProactive(args: {
  projectId: string
  organizationId: string
  payload: Pick<ProactivePayload, 'followUp' | 'reminders' | 'importantDates'>
}): Promise<ApplyCardSubmitResult> {
  const { projectId, organizationId, payload } = args

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

  const proactive = {
    followUp: payload.followUp,
    reminders: payload.reminders,
    importantDates: payload.importantDates,
  }

  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: conversation.id, organizationId },
      select: { builderState: true },
    })
    // null/garbage/legado → DEFAULT_BUILDER_STATE (parseBuilderState nunca lança).
    const fresh = parseBuilderState(row?.builderState)
    // Substitui o subtree `proactive` INTEIRO (last-write-wins, não deep-merge).
    const withProactive: BuilderState = { ...fresh, proactive }
    const next = invalidateRefinement(
      withProactive,
      'A capacidade de mensagens proativas mudou o que foi testado pelo refinamento.',
    )

    await tx.builderProjectConversation.updateMany({
      where: { id: conversation.id, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })
  })

  const anyOn = proactive.followUp || proactive.reminders || proactive.importantDates
  return {
    ok: true,
    conversationId: conversation.id,
    cardInstruction: anyOn
      ? 'O usuário LIGOU a capacidade de mensagens proativas (automações). ' +
        'Considere-a parte do contexto do agente. Lembre que envios fora da janela de 24h do WhatsApp exigem template aprovado.'
      : 'O usuário DESLIGOU a capacidade de mensagens proativas. ' +
        'O agente permanece reativo (só responde a mensagens recebidas).',
  }
}

/**
 * FR-46 (diagnóstico do Modo Pesquisa — backlog #9) — diagnosis: card READ-MOSTLY
 * de ACK da fase Conhecer (surge DEPOIS de build_mode/source e ANTES de mission,
 * quando `buildMode === 'pesquisa'`). É um ACK puro, espelho de
 * `applyKnowledgeAck`/`applyMediaAck`: flipa o sentinel `confirmations.diagnosis`
 * server-side via `applySentinelAck` (write atômico org-scoped, re-read FRESCO) —
 * NADA vem do body. Diferente dos acks knowledge/media, ele tem a GUARDA NFR-12: o
 * passo só existe em projetos mission-first (o engine v2 só o surfa quando
 * `missionFirst === true && buildMode === 'pesquisa'`), então rejeitamos um POST
 * forjado a um projeto v2 puro. NÃO emite evento de funil (`diagnosis` não pertence
 * ao vocabulário fechado de `trackJourneyEvent`). Self-contained.
 */
export async function applyDiagnosis(args: {
  projectId: string
  organizationId: string
  current: BuilderState
}): Promise<ApplyCardSubmitResult> {
  const { projectId, organizationId, current } = args

  // NFR-12 hardening: o passo de diagnóstico só existe em projetos mission-first
  // no Modo Pesquisa. Rejeita um POST forjado a um projeto v2 puro / outro modo.
  if (current.missionFirst !== true) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'O passo de diagnóstico não se aplica a este projeto.',
    }
  }

  return applySentinelAck({
    projectId,
    organizationId,
    sentinel: 'diagnosis',
    invalidationReason:
      'O passo diagnosis alterou o contexto de pesquisa testado pelo refinamento.',
    cardInstruction:
      'O usuário REVISOU o diagnóstico do negócio (Modo Pesquisa) e confirmou para seguir. ' +
      'Considere o que já foi entendido do negócio como contexto e prossiga para o próximo passo da jornada (a missão). ' +
      'Não reabra o card de diagnóstico.',
  })
}

/**
 * T32 (FR-16, plan §3.3 item 3) — test_drive: gate SOFT da fase Testar. Tanto
 * "Já testei" (`tested`) quanto "Publicar sem testar" (`skip`) destravam o passo
 * (flipam o MESMO sentinel `confirmations.testDrive`), mas a copy do ACK e o
 * evento de funil RAMIFICAM por ação: o LLM NUNCA promete que o agente foi
 * validado quando o usuário pulou o teste. Self-contained, igual aos demais
 * handlers da jornada v2: flip via `applySentinelAck` (write atômico org-scoped)
 * e, DEPOIS do write, emite `test_done`/`test_skipped` fire-and-forget.
 */
export async function applyTestDrive(args: {
  projectId: string
  organizationId: string
  journeyVersion: BuilderState['journeyVersion']
  payload: Pick<TestDrivePayload, 'action'>
}): Promise<ApplyCardSubmitResult> {
  const { projectId, organizationId, journeyVersion, payload } = args
  const tested = payload.action === 'tested'

  const result = await applySentinelAck({
    projectId,
    organizationId,
    sentinel: 'testDrive',
    cardInstruction: tested
      ? 'O usuário TESTOU o agente no playground e seguiu adiante. ' +
        'Considere o teste concluído e prossiga para a publicação (deploy). ' +
        'Não reabra o card de teste.'
      : 'O usuário optou por PUBLICAR SEM TESTAR (pulou o teste no playground). ' +
        'NÃO afirme que o agente foi validado — apenas siga para a publicação (deploy) e ' +
        'lembre que ele pode testar a qualquer momento na aba Testar. Não reabra o card de teste.',
  })

  // Funil — só APÓS o flip persistir (não anunciamos um passo não-gravado). O
  // evento ramifica por ação: tested → test_done, skip → test_skipped.
  if (result.ok) {
    await trackJourneyEvent({
      organizationId,
      projectId,
      journeyVersion,
      event: tested ? 'test_done' : 'test_skipped',
    })
  }

  return result
}

/**
 * T32 (FR-16, plan §3.3) — published_next_steps: card TERMINAL da fase Lançar
 * (surfa só pós-publicação). Ação única `'ack'`: flipa `confirmations.publishedNextSteps`
 * e emite o evento de funil `next_steps_ack`. Mesmo idiom de `applyTestDrive` —
 * flip atômico org-scoped via `applySentinelAck`, evento depois do write.
 */
export async function applyPublishedNextSteps(args: {
  projectId: string
  organizationId: string
  journeyVersion: BuilderState['journeyVersion']
}): Promise<ApplyCardSubmitResult> {
  const { projectId, organizationId, journeyVersion } = args

  const result = await applySentinelAck({
    projectId,
    organizationId,
    sentinel: 'publishedNextSteps',
    cardInstruction:
      'O usuário RECONHECEU os próximos passos pós-publicação. ' +
      'O agente já está no ar — não reabra o card de próximos passos.',
  })

  if (result.ok) {
    await trackJourneyEvent({
      organizationId,
      projectId,
      journeyVersion,
      event: 'next_steps_ack',
    })
  }

  return result
}

/**
 * T91 (FR-24/25, plan §3.3 item 5) — channel_platform: o usuário escolhe EM QUE
 * canais o agente atende. Grava `channel.platforms` + `channel.whatsappMode` e
 * flipa `confirmations.channelPlatform` — o engine v2 (T15) lê `platforms` para
 * surfar `whatsapp_connect`/`instagram_connect` condicionalmente.
 *
 * RE-VALIDAÇÃO server-side (nunca confia no body — padrão do módulo):
 *  - `platforms` é deduplicado mantendo a ordem (1ª ocorrência);
 *  - **multi-canal (Onda 5b/T94)**: 1 ou 2 plataformas aceitas — o mesmo agente
 *    atende ambas (T92 já permite N deployments por agente);
 *  - `whatsappMode` obrigatório quando `'whatsapp'` está selecionado
 *    (`channelPlatformWhatsappModeOk`); o modo só é persistido quando WhatsApp
 *    está entre as plataformas (IG não tem nível 2 — não guardamos modo órfão).
 *
 * Write atômico org-scoped (re-lê o state FRESCO dentro da tx, igual a
 * `applyBusinessIdentity`, para não atropelar um submit concorrente). NÃO emite
 * evento de funil: `channel_connected` pertence à conexão REAL (webhook UAZ, T35),
 * não à seleção de plataforma. No `any`.
 */
export async function applyChannelPlatform(args: {
  conversationId: string
  organizationId: string
  current: BuilderState
  payload: Pick<ChannelPlatformPayload, 'platforms' | 'whatsappMode'>
}): Promise<ApplyCardSubmitResult> {
  const { conversationId, organizationId, current, payload } = args

  // Dedupe preservando a ordem (1ª ocorrência) — nunca confia no body.
  const platforms = Array.from(new Set(payload.platforms))

  const wantsWhatsapp = platforms.includes('whatsapp')
  // Cross-field: whatsappMode obrigatório quando WhatsApp está selecionado.
  if (!channelPlatformWhatsappModeOk({ platforms, whatsappMode: payload.whatsappMode })) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'Escolha como conectar o WhatsApp (QR Code ou Cloud API).',
    }
  }
  // Modo só é persistido quando WhatsApp está entre as plataformas (sem órfão).
  const whatsappMode = wantsWhatsapp ? payload.whatsappMode : undefined

  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { builderState: true },
    })
    // Fallback ao `current` já carregado quando o read in-tx não acha (test doubles)
    // para o handler nunca descartar silenciosamente o write.
    const fresh =
      row?.builderState != null ? parseBuilderState(row.builderState) : current

    // Replace the whole channel subtree. `patchBuilderState` deep-merges and
    // would preserve an old `whatsappMode` when switching to Instagram-only.
    const withChannel: BuilderState = {
      ...fresh,
      channel: {
        platforms,
        ...(whatsappMode ? { whatsappMode } : {}),
      },
    }
    const next = invalidateRefinement(
      applyConfirmation(withChannel, 'channelPlatform'),
      'O card channel_platform alterou os canais testados pelo refinamento.',
    )

    await tx.builderProjectConversation.updateMany({
      where: { id: conversationId, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })
  })

  // Rótulo por plataforma, na ordem escolhida — multi-canal lista AMBAS (Onda 5b).
  const platformLabel = platforms
    .map((p) =>
      p === 'whatsapp'
        ? `WhatsApp${whatsappMode === 'cloud' ? ' (Cloud API)' : ' (QR Code)'}`
        : 'Instagram',
    )
    .join(' + ')
  const multi = platforms.length > 1

  return {
    ok: true,
    conversationId,
    cardInstruction:
      `O usuário ESCOLHEU ${multi ? 'os canais' : 'o canal'} de atendimento via card: ${platformLabel}. ` +
      `Siga para a conexão ${multi ? 'de cada canal escolhido' : 'do canal escolhido'} e o próximo passo da jornada. ` +
      'Não reabra o card de escolha de canal.',
  }
}

/**
 * FR-22 — valida CADA seção do card composto `agent_review` server-side ANTES de
 * qualquer write. Regra mínima de "revisado o suficiente para confirmar", espelho
 * do que cada card individual carrega quando preenchido de verdade:
 *   - persona: ao menos um campo com texto (nome/tom/estilo/saudação).
 *   - services: ao menos um assunto que a IA pode responder/conduzir (o "não
 *     deve prometer" é só complemento).
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
    errors.services =
      'Informe ao menos um assunto que a IA pode responder ou conduzir.'
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
 * serviços + horários + APROVAÇÃO DE CRIAÇÃO numa ÚNICA confirmação consolidada
 * (NFR-07: 1 decisão, 1 ACK em vez de 4) e, opcionalmente, aplica o disclosure
 * (seção avançada de identidade) no MESMO handler.
 *
 * Fluxo:
 *  1. VALIDAÇÃO GRANULAR (FR-22) — antes de qualquer escrita. Em falha de uma
 *     seção, retorna `{ errors: { persona?, services?, hours? } }` SEM nenhum write
 *     parcial; o client preserva o estado local das seções válidas (T43).
 *  2. Compõe os exports PUROS de `apply/{persona,services,hours}.ts` num único
 *     state encadeado (cada um flipa seu sentinel) e LIMPA explicitamente
 *     `capturedProposals.{persona,services,hours}` via `clearCapturedProposals`
 *     (o deepMerge nunca deleta — o clear precisa ser explícito).
 *  3. Deriva/preserva `proposal.{name,description}` e flipa `agentApproved`, então
 *     o LLM pode chamar `create_agent` sem abrir um segundo card.
 *  4. Persiste em UM `updateMany` org-scoped (4 sentinels num só write) e, quando
 *     há `disclosure`, aplica `normalizeIdentityCard`+`mergeIdentityCardIntoMetadata`
 *     sobre `BuilderProject.metadata.identityCard` na MESMA transação — 1 POST real,
 *     sem segundo request ao PATCH /builder/identity. A injeção no prompt acontece
 *     depois, no `create_agent` (o agente ainda não existe no agent_review).
 *  5. Emite `review_done` (funil), fire-and-forget.
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

  let approvedProposal = deriveApprovedAgentProposal(current)

  // 2-4. Read-modify-write atômico org-scoped: compõe os 3 cards num único state
  // (cada export puro flipa seu sentinel), limpa as propostas capturadas, carimba
  // a proposta aprovada + agentApproved e grava tudo num só `updateMany`. O
  // disclosure (quando presente) vai no metadata do projeto NA MESMA transação.
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

    approvedProposal = deriveApprovedAgentProposal(next)
    next = patchBuilderState(next, { proposal: approvedProposal })
    next = applyConfirmation(next, 'agentApproved')
    next = invalidateRefinement(
      next,
      'O card agent_review alterou voz, escopo ou horários testados pelo refinamento.',
    )

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
      'O usuário CONFIRMOU a revisão final e AUTORIZOU a criação do agente via card (voz, escopo e equipe humana).' +
      `${disclosureNote} ` +
      `Proposta aprovada: nome "${approvedProposal.name}", descrição "${approvedProposal.description}". ` +
      'Esses dados já estão no contexto do agente — não reabra os cards de persona, escopo, horários, agent_review ou agent_approval. ' +
      'Prossiga com create_agent usando o nome e a descrição aprovados; não peça nova aprovação. Depois siga para o próximo passo da jornada.',
  }
}
