/**
 * Builder Cards — review/read-only-summary.logic (FR-53 · revisão final orientada a negócio)
 *
 * Lógica PURA (sem React, sem I/O, sem `any`) que deriva o RETRATO somente-leitura
 * do pacote do agente a partir do `BuilderState`, em linguagem de negócio (FR-49).
 * É a fonte única que `agent-review-card.tsx` consome para as seções de leitura —
 * NÃO re-decide nada (zero gravação): só LÊ o `value` e formata.
 *
 * Reuso de fonte única (FR-09): as CAPACIDADES ATIVAS são derivadas pelos MESMOS
 * helpers que a seção Capacidades do overview usa (`handoffSummary`/`pricingSummary`/
 * `calendarSummary`/`proactiveSummary` → `enabled-tools-derivation.pure`), para que
 * o retrato da revisão e o toggle de Capacidades nunca divirjam.
 */

import type {
  BuilderState,
  HandoffMode,
} from "@/server/ai-module/builder/cards/builder-state"
import {
  deriveCalendarToolChanges,
  deriveHandoffToolChanges,
  derivePricingToolChanges,
} from "@/server/ai-module/builder/deploy/enabled-tools-derivation.pure"

/** Uma linha do retrato: rótulo curto + descrição em linguagem de negócio. */
export interface ReadOnlyCapability {
  /** Chave estável para `key` do React (não exibida). */
  id: string
  label: string
  detail: string
}

/** Uma seção somente-leitura do retrato. `items` vazio → o card omite a seção. */
export interface ReadOnlySection {
  id: string
  title: string
  items: string[]
}

/** Rótulo humano (linguagem de negócio, FR-49) de cada estratégia de esgotado.
 *  Espelha SOLD_OUT_STRATEGY_LABELS (journey-v2.ts) — mesma copy do retrato server-side. */
const SOLD_OUT_STRATEGY_LABELS: Record<
  "interest_list" | "human_confirm" | "available_confirmed",
  string
> = {
  interest_list: "Captar lista de interesse, sem prometer unidade disponível.",
  human_confirm:
    "Qualificar e passar para um consultor validar a disponibilidade.",
  available_confirmed:
    "Trabalhar com a disponibilidade que você confirmar fora do site.",
}

/** `true` quando o handoff transfere para humano (modo definido e != nenhum). */
function isHandoffActive(handoff: BuilderState["handoff"]): boolean {
  return handoff.mode !== undefined && handoff.mode !== "nenhum"
}

/** `true` quando o agente fala preços (tem itens E divulgação != none). */
function isPricingActive(pricing: BuilderState["pricing"]): boolean {
  return pricing.items.length > 0 && pricing.disclosureStyle !== "none"
}

/** `true` quando QUALQUER preset proativo está ligado. */
function isProactiveActive(proactive: BuilderState["proactive"]): boolean {
  return (
    proactive?.followUp === true ||
    proactive?.reminders === true ||
    proactive?.importantDates === true
  )
}

/** Resumo de negócio do handoff (reusa a derivação de tool — fonte única FR-09). */
function handoffDetail(mode: HandoffMode | undefined): string {
  const change = deriveHandoffToolChanges({ mode, steps: [] })
  return change.ensure.includes("transfer_to_human")
    ? "Transfere o atendimento para uma pessoa quando precisar."
    : "Responde sozinho — não passa o atendimento para humano."
}

/** Resumo de negócio dos preços (reusa a derivação de tool — fonte única FR-09). */
function pricingDetail(pricing: BuilderState["pricing"]): string {
  const change = derivePricingToolChanges({
    activeItemCount: pricing.items.length,
    disclosureStyle: pricing.disclosureStyle,
  })
  return change.ensure.includes("get_pricing")
    ? "Informa os preços da sua tabela durante a conversa."
    : "Não fala preços."
}

/** Resumo de negócio da agenda (reusa a derivação de tool — fonte única FR-09). */
function calendarDetail(alsoSchedule: boolean): string {
  const change = deriveCalendarToolChanges({
    alsoSchedule,
    hasActiveConnection: false,
  })
  if (change.ensure.includes("schedule_appointment")) {
    return "Registra o interesse de agendamento e marca quando a agenda estiver conectada."
  }
  return "Não agenda compromissos."
}

/** Presets proativos LIGADOS, em linguagem de negócio (FR-49). */
function proactivePresetsOn(proactive: BuilderState["proactive"]): string[] {
  const on: string[] = []
  if (proactive?.followUp) on.push("retoma leads parados")
  if (proactive?.reminders) on.push("lembra de compromissos marcados")
  if (proactive?.importantDates) on.push("age em datas importantes")
  return on
}

/**
 * Capacidades ATIVAS, DERIVADAS do state (FR-09). Só entra no retrato o que está
 * efetivamente ligado — capacidades desligadas não poluem a revisão.
 */
export function deriveActiveCapabilities(
  value: BuilderState,
): ReadOnlyCapability[] {
  const out: ReadOnlyCapability[] = []

  if (isHandoffActive(value.handoff)) {
    out.push({
      id: "handoff",
      label: "Transferir para humano",
      detail: handoffDetail(value.handoff.mode),
    })
  }

  if (isPricingActive(value.pricing)) {
    out.push({
      id: "pricing",
      label: "Preços",
      detail: pricingDetail(value.pricing),
    })
  }

  if (value.handoff.alsoSchedule) {
    out.push({
      id: "agenda",
      label: "Agenda",
      detail: calendarDetail(value.handoff.alsoSchedule),
    })
  }

  if (isProactiveActive(value.proactive)) {
    out.push({
      id: "proactive",
      label: "Mensagens proativas",
      detail: `Toma a iniciativa: ${proactivePresetsOn(value.proactive).join(", ")}.`,
    })
  }

  return out
}

/** Rótulo da missão escolhida (label > key), ou undefined se não há missão. */
export function missionLabel(value: BuilderState): string | undefined {
  const mission = value.mission
  if (!mission) return undefined
  const label = mission.label?.trim()
  if (label) return label
  const key = mission.key?.trim()
  return key || undefined
}

/** Critérios de qualificação cadastrados (já em linguagem de negócio). */
export function qualificationItems(value: BuilderState): string[] {
  return (value.qualification?.fields ?? [])
    .map((field) => field.trim())
    .filter(Boolean)
}

/** Restrição comercial cadastrada (rótulo de negócio + nota), ou []. */
export function restrictionItems(value: BuilderState): string[] {
  const strategy = value.restrictions?.soldOutStrategy
  if (!strategy) return []
  const items = [SOLD_OUT_STRATEGY_LABELS[strategy]]
  const note = value.restrictions?.note?.trim()
  if (note) items.push(`Observação: ${note}`)
  return items
}

/**
 * Ferramentas/integrações externas conhecidas pelo `value`. Hoje o BuilderState só
 * carrega a PROPOSTA de integração (W1) — o catálogo final vem de getCapabilities,
 * fora do value. Por isso só listamos a integração proposta quando presente;
 * senão a seção é omitida (brief: "se houver dado disponível no value; senão omitir").
 */
export function integrationItems(value: BuilderState): string[] {
  const platform = value.integration?.proposed?.platform?.trim()
  if (!platform) return []
  const whatData = value.integration?.proposed?.whatDataSent?.trim()
  return [whatData ? `${platform} — ${whatData}` : platform]
}

/**
 * "O que o agente nunca pode prometer" — derivado de restrições + serviços não
 * oferecidos. NÃO é uma nova decisão: só explicita, em linguagem de negócio, os
 * limites já cadastrados, para o usuário revisar antes de criar o agente.
 *
 * - soldOutStrategy `interest_list`/`human_confirm` → não pode prometer
 *   disponibilidade/preço (a estratégia exige confirmação humana antes).
 * - services.notOffered → cada item vira um limite explícito ("não promete X").
 */
export function neverPromiseItems(value: BuilderState): string[] {
  const out: string[] = []
  const strategy = value.restrictions?.soldOutStrategy

  if (strategy === "interest_list") {
    out.push(
      "Não prometer disponibilidade nem preço de unidades que podem estar esgotadas.",
    )
  } else if (strategy === "human_confirm") {
    out.push(
      "Não confirmar disponibilidade ou preço sem um consultor validar antes.",
    )
  }

  for (const raw of value.services.notOffered) {
    const item = raw.trim()
    if (item) out.push(`Não oferecer/prometer: ${item}.`)
  }

  return out
}

/**
 * Monta todas as seções somente-leitura do retrato (FR-53), na ordem do brief.
 * Cada seção com `items` vazio é OMITIDA pelo card (sem ruído visual).
 */
export function buildReadOnlySections(value: BuilderState): ReadOnlySection[] {
  const sections: ReadOnlySection[] = []

  const mission = missionLabel(value)
  if (mission) {
    sections.push({ id: "mission", title: "Missão", items: [mission] })
  }

  const capabilities = deriveActiveCapabilities(value)
  if (capabilities.length > 0) {
    sections.push({
      id: "capabilities",
      title: "Capacidades ativas",
      items: capabilities.map((cap) => `${cap.label}: ${cap.detail}`),
    })
  }

  const qualification = qualificationItems(value)
  if (qualification.length > 0) {
    sections.push({
      id: "qualification",
      title: "Critérios de qualificação",
      items: qualification,
    })
  }

  const restrictions = restrictionItems(value)
  if (restrictions.length > 0) {
    sections.push({
      id: "restrictions",
      title: "Restrições comerciais",
      items: restrictions,
    })
  }

  const integrations = integrationItems(value)
  if (integrations.length > 0) {
    sections.push({
      id: "integrations",
      title: "Ferramentas e integrações",
      items: integrations,
    })
  }

  const neverPromise = neverPromiseItems(value)
  if (neverPromise.length > 0) {
    sections.push({
      id: "never-promise",
      title: "O que o agente nunca pode prometer",
      items: neverPromise,
    })
  }

  return sections
}
