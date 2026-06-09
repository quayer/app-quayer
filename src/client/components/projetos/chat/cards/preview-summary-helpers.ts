/**
 * Builder Cards — preview_summary helpers (Orayon Uplift, G12)
 *
 * Lógica PURA (sem I/O, sem React, sem `any`) que inspeciona o BuilderState e
 * aponta os pontos de "config genérica" antes de publicar. Cada regra acionada
 * vira UM warning amber, mostrado pelo `preview-summary-card.tsx`.
 *
 * IMPORTANTE: warnings são SOMENTE informativos. Eles NUNCA bloqueiam o deploy
 * — o passo `summary` continua confirmável (onSubmit({})) mesmo com a config
 * genérica. O usuário pode "publicar assim e ajustar depois".
 *
 * Mantém o card enxuto: o card só consome `computeSummaryWarnings` + as chaves
 * de área (`SUMMARY_AREA`) para pintar as seções certas de amber.
 */

import type { BuilderState } from "./types"

/**
 * Identificadores estáveis de cada área que pode receber warning. O card usa
 * `warning.area` para casar com a seção correspondente e pintá-la de amber.
 */
export const SUMMARY_AREA = {
  persona: "persona",
  greeting: "greeting",
  services: "services",
  pricing: "pricing",
  hours: "hours",
  handoff: "handoff",
} as const

/** Uma chave de área (valor de {@link SUMMARY_AREA}). */
export type SummaryArea = (typeof SUMMARY_AREA)[keyof typeof SUMMARY_AREA]

/**
 * Um aviso de "config genérica". `area` aponta a seção que ficou genérica e
 * `message` é a copy PT-BR mostrada ao profissional leigo.
 */
export interface SummaryWarning {
  area: SummaryArea
  message: string
}

/**
 * `true` quando a string existe e tem conteúdo real (não só espaços).
 * Centraliza o teste de "campo preenchido" das regras abaixo.
 */
function hasText(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().length > 0
}

// ==========================================
// Resumos (string-only, sem JSX → helper puro)
// ==========================================

/** Rótulos PT-BR para o enum `handoff.mode` (Onda 2). */
const HANDOFF_MODE_LABELS: Record<string, string> = {
  solo: "Eu mesmo atendo",
  roleta: "Equipe em rodízio",
  departamentos: "Triagem por assunto",
  nenhum: "Só conversa",
}

/** Junta uma lista numa frase curta, ou "" quando não há nada a mostrar. */
function joinList(items: readonly string[] | undefined): string {
  if (!items || items.length === 0) return ""
  return items.filter((item) => item.trim().length > 0).join(", ")
}

/** Resumo da personalidade: nome + tom + estilo. */
export function summarizePersona(persona: BuilderState["persona"]): string {
  const parts: string[] = []
  if (persona.name) parts.push(persona.name)
  if (persona.tone) parts.push(`tom ${persona.tone}`)
  if (persona.style) parts.push(`estilo ${persona.style}`)
  return joinList(parts)
}

/**
 * Resumo de serviços: "Oferece: …" e "Não oferece: …" em linhas separadas
 * (o card renderiza com `whitespace-pre-line`, preservando o `\n`).
 */
export function summarizeServices(services: BuilderState["services"]): string {
  const offered = joinList(services.offered)
  const notOffered = joinList(services.notOffered)
  const lines: string[] = []
  if (offered) lines.push(`Oferece: ${offered}`)
  if (notOffered) lines.push(`Não oferece: ${notOffered}`)
  return lines.join("\n")
}

/** Resumo de horários: preset/personalizado + timezone. */
export function summarizeHours(hours: BuilderState["hours"]): string {
  const parts: string[] = []
  if (hours.preset) parts.push(hours.preset)
  else if (hours.schedule != null) parts.push("horário personalizado")
  if (hours.timezone) parts.push(`(${hours.timezone})`)
  return joinList(parts)
}

/** Formata centavos em moeda PT-BR (fallback robusto para código desconhecido). */
function formatPrice(priceCents: number, currency: string): string {
  const amount = priceCents / 100
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(amount)
  } catch {
    // Código de moeda desconhecido → decimal simples + código bruto.
    return `${currency} ${amount.toFixed(2)}`
  }
}

/** Resumo de preços: contagem + prévia dos 3 primeiros itens. */
export function summarizePricing(pricing: BuilderState["pricing"]): string {
  if (pricing.items.length === 0) return ""
  const preview = pricing.items
    .slice(0, 3)
    .map(
      (item) => `${item.name} — ${formatPrice(item.priceCents, pricing.currency)}`,
    )
    .join(", ")
  const extra = pricing.items.length - 3
  const count = pricing.items.length
  const noun = count === 1 ? "item" : "itens"
  let out = `${count} ${noun}`
  if (preview) out += ` · ${preview}`
  if (extra > 0) out += ` e mais ${extra}`
  return out
}

/**
 * Resumo da passagem para humano (Onda 2 — card `handoff`): modo + roteiro de
 * qualificação + roster (departamento/roleta) + agenda. Consolida os antigos
 * `summarizeQualification` + `summarizeTeam` num único resumo.
 *
 * - modo (`solo`/`roleta`/`departamentos`/`nenhum`), em PT-BR;
 * - departamento + nº de pessoas na roleta (só quando o modo usa roster);
 * - nº de perguntas de qualificação antes do handoff;
 * - "também marca na agenda" / "agenda conectada".
 */
export function summarizeHandoff(
  handoff: BuilderState["handoff"],
  calendar: BuilderState["calendar"],
): string {
  const parts: string[] = []

  if (handoff.mode) {
    parts.push(HANDOFF_MODE_LABELS[handoff.mode] ?? handoff.mode)
  }

  if (handoff.departmentName) parts.push(handoff.departmentName)
  if (handoff.members.length > 0) {
    const noun = handoff.members.length === 1 ? "pessoa" : "pessoas"
    parts.push(`${handoff.members.length} ${noun} na roleta`)
  }

  if (handoff.steps.length > 0) {
    const noun = handoff.steps.length === 1 ? "pergunta" : "perguntas"
    parts.push(`${handoff.steps.length} ${noun}`)
  }

  const calendarConnected =
    calendar.connectionId || calendar.status === "connected"
  if (calendarConnected) parts.push("agenda conectada")
  else if (handoff.alsoSchedule) parts.push("também marca na agenda")

  return joinList(parts)
}

/** Resumo da ativação: modo + palavras-chave. */
export function summarizeActivation(
  activation: BuilderState["activation"],
): string {
  const parts: string[] = []
  if (activation.mode) parts.push(activation.mode)
  if (activation.keywords.length > 0) {
    parts.push(`palavras-chave: ${joinList(activation.keywords)}`)
  }
  return joinList(parts)
}

/**
 * Avalia o BuilderState e devolve a lista de warnings de config genérica.
 *
 * Cada regra acionada acrescenta exatamente UM warning (na ordem das seções do
 * resumo). Lista vazia ⇒ nada de genérico ⇒ o card não mostra o bloco amber.
 *
 * Regras (cada uma = 1 warning amber):
 *  1. persona sem nome próprio → atendente soa genérico.
 *  2. saudação vazia → sem boas-vindas personalizadas.
 *  3. nenhum serviço cadastrado → o agente improvisa.
 *  4. sem tabela de preços → não responde valores.
 *  5. horário não definido (sem preset E sem schedule) → a definir.
 *  6. passagem para humano sem modo definido → comportamento genérico.
 */
export function computeSummaryWarnings(value: BuilderState): SummaryWarning[] {
  const warnings: SummaryWarning[] = []

  // 1. Persona sem nome próprio.
  if (!hasText(value.persona.name)) {
    warnings.push({
      area: SUMMARY_AREA.persona,
      message: "Atendente sem nome próprio — vai soar genérico",
    })
  }

  // 2. Saudação vazia.
  if (!hasText(value.persona.greeting)) {
    warnings.push({
      area: SUMMARY_AREA.greeting,
      message: "Sem saudação personalizada",
    })
  }

  // 3. Nenhum serviço cadastrado.
  if (value.services.offered.length === 0) {
    warnings.push({
      area: SUMMARY_AREA.services,
      message: "Nenhum serviço cadastrado — o agente improvisa",
    })
  }

  // 4. Sem tabela de preços.
  if (value.pricing.items.length === 0) {
    warnings.push({
      area: SUMMARY_AREA.pricing,
      message: "Sem tabela de preços — não responde valores",
    })
  }

  // 5. Horário não definido (nenhum preset e nenhum schedule manual).
  if (!value.hours.preset && value.hours.schedule == null) {
    warnings.push({
      area: SUMMARY_AREA.hours,
      message: "Horário de atendimento a definir",
    })
  }

  // 6. Passagem para humano sem modo definido.
  if (!hasText(value.handoff.mode)) {
    warnings.push({
      area: SUMMARY_AREA.handoff,
      message: "Passagem para humano não definida — comportamento genérico",
    })
  }

  return warnings
}
