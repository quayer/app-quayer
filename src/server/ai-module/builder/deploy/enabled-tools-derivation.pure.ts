/**
 * Builder Module — Derivação determinística de `enabledTools` — NÚCLEO PURO
 * (FR-09/FR-10 da spec `specs/jornada-builder-v2/spec.md`)
 *
 * Este arquivo é a metade CLIENT-SAFE de `enabled-tools-derivation.ts`: helpers
 * 100% puros (`derive*ToolChanges` + `reconcileEnabledTools`, zero IO, zero
 * `any`, ZERO import de `@/server/services/database`) — pode ser importado por
 * código client/edge para prever as capacidades sem arrastar o cliente Prisma.
 * O probe de IO (`hasActiveCalendarConnection`) FICA no arquivo original, que
 * re-exporta tudo daqui para os imports existentes seguirem intactos.
 *
 * As capacidades TÉCNICAS do agente publicado DERIVAM das decisões do usuário —
 * nunca são re-decididas numa segunda superfície:
 *
 *   - pricing (card de preços)        → get_pricing            (materialize_pricing)
 *   - handoff (card unificado, modo)  → transfer_to_human
 *                                       (+ create_lead c/ roteiro) (materialize_team)
 *   - agenda (alsoSchedule + conexão) → check_availability / create_event /
 *                                       cancel_event / calendar_list_slots, OU
 *                                       schedule_appointment como FALLBACK sem
 *                                       conexão                 (materialize_team)
 *
 * Fecha os bugs de costura comprovados em auditoria: catálogo de preços
 * materializado mas `get_pricing` nunca anexada (catálogo órfão); modo roleta
 * publicado sem `transfer_to_human` (agente que não consegue transferir);
 * "Agenda Google" marcada no antigo card de tools sem exigir conexão real.
 * O catálogo do card de tools (`propose-tool-selection.tool.ts`) NÃO oferece
 * mais essas capacidades — só resta o ortogonal `lead_only`.
 *
 * INVARIANTE DURO: `AIAgentConfig.enabledTools` pode conter tools CUSTOM ou
 * desconhecidas — o reconcile é um SET-MERGE que preserva entradas
 * desconhecidas e a ordem existente; NUNCA substitui o array inteiro por um
 * catálogo fixo. Remove APENAS as keys derivadas listadas explicitamente.
 */

import type { HandoffMode } from '../cards/builder-state'
import type { PricingDisclosureStyle } from './pricing-reconcile'

// ==========================================
// Keys derivadas (todas DEVEM existir em BUILTIN_TOOL_NAMES — espelha o
// hardcode de 'buscar_media' em materialize-media.handler.ts; não importamos
// o registry para manter este módulo leve/testável sem o runtime inteiro)
// ==========================================

/** Tools REAIS de Google Calendar — anexadas quando há conexão ativa. */
export const CALENDAR_TOOL_KEYS: readonly string[] = [
  'check_availability',
  'create_event',
  'cancel_event',
  'calendar_list_slots',
]

/** Registro de intenção de agendamento — FALLBACK quando NÃO há conexão. */
export const SCHEDULE_FALLBACK_TOOL_KEY = 'schedule_appointment'

// ==========================================
// Tipos do plano
// ==========================================

/** Mudança declarativa: keys que DEVEM estar presentes / DEVEM sair. */
export interface EnabledToolsChange {
  /** Keys garantidas (append ao final quando ausentes; nunca duplica). */
  ensure: readonly string[]
  /** Keys removidas (filtradas do array; nunca toca outras entradas). */
  remove: readonly string[]
}

/** Resultado do set-merge: novo array + flag para evitar UPDATE no-op. */
export interface EnabledToolsPlan {
  next: string[]
  changed: boolean
}

// ==========================================
// reconcileEnabledTools (puro)
// ==========================================

/**
 * Aplica uma lista de `EnabledToolsChange` sobre o array atual de tools.
 *
 * Semântica (set-merge, NUNCA substitui o array inteiro):
 *  - entradas desconhecidas/custom são PRESERVADAS na ordem original;
 *  - `remove` filtra apenas as keys listadas;
 *  - `ensure` faz append ao final apenas das keys ausentes (sem duplicar);
 *  - `ensure` VENCE `remove` em conflito (as derivações de hoje são disjuntas;
 *    defensivo para o futuro — melhor uma tool a mais do que capar capacidade);
 *  - `changed=false` quando o resultado é idêntico (caller pula o UPDATE).
 *
 * Pura: não muta inputs, sem IO, sem `any`. Aceita `null`/`undefined` como
 * array vazio (defensivo a mocks/linhas legadas).
 */
export function reconcileEnabledTools(
  current: readonly string[] | null | undefined,
  changes: readonly EnabledToolsChange[],
): EnabledToolsPlan {
  const base = current ?? []

  const ensureSet = new Set<string>()
  const removeSet = new Set<string>()
  for (const change of changes) {
    for (const key of change.ensure) ensureSet.add(key)
    for (const key of change.remove) removeSet.add(key)
  }
  for (const key of ensureSet) removeSet.delete(key)

  const next = base.filter((key) => !removeSet.has(key))
  const present = new Set(next)
  for (const key of ensureSet) {
    if (!present.has(key)) {
      next.push(key)
      present.add(key)
    }
  }

  const changed =
    next.length !== base.length || next.some((key, i) => key !== base[i])
  return { next, changed }
}

// ==========================================
// Derivações por domínio (puras)
// ==========================================

/**
 * PRICING (FR-10: "não falar preços" + tool de preços ativa = impossível):
 *  - itens ativos E disclosureStyle !== 'none' → garante `get_pricing` (lê o
 *    catálogo REAL PriceList/PriceItem materializado);
 *  - 'none' OU lista vazia → REMOVE `get_pricing` E `send_pricing` (esta ecoa
 *    qualquer valor que o LLM disser — perigosa sob política de não divulgar).
 *
 * Nota: com estilo 'none' o catálogo continua materializado (fonte de verdade
 * do usuário) — só a CAPACIDADE de falar preço é desligada.
 */
export function derivePricingToolChanges(input: {
  activeItemCount: number
  disclosureStyle: PricingDisclosureStyle
}): EnabledToolsChange {
  const speaksPricing =
    input.activeItemCount > 0 && input.disclosureStyle !== 'none'
  if (speaksPricing) {
    return { ensure: ['get_pricing'], remove: [] }
  }
  return { ensure: [], remove: ['get_pricing', 'send_pricing'] }
}

/**
 * HANDOFF (FR-10: roleta publicada sem conseguir transferir = impossível):
 *  - modo 'solo' | 'roleta' | 'departamentos' → garante `transfer_to_human`
 *    (a tool UNIFICADA cobre routing self/department); com roteiro de
 *    qualificação (`steps`) garante também `create_lead` — o que o antigo
 *    catálogo `qualified_handoff` anexava (create_lead + transfer_to_human);
 *  - modo 'nenhum' → REMOVE `transfer_to_human` (IA 100% autônoma, FR-08).
 *    NUNCA remove `create_lead`: é ortogonal (capability `lead_only` do card);
 *  - modo AUSENTE (usuário ainda não decidiu) → NEUTRO: não anexa (opt-in,
 *    default desligado — FR-08) nem remove (não clobbera anexos manuais/legados).
 */
export function deriveHandoffToolChanges(handoff: {
  mode?: HandoffMode
  steps: readonly string[]
}): EnabledToolsChange {
  if (handoff.mode === undefined) {
    return { ensure: [], remove: [] }
  }
  if (handoff.mode === 'nenhum') {
    return { ensure: [], remove: ['transfer_to_human'] }
  }
  const ensure = ['transfer_to_human']
  if (handoff.steps.length > 0) ensure.push('create_lead')
  return { ensure, remove: [] }
}

/**
 * AGENDA (FR-11: marcar agenda sem conexão real = impossível por construção):
 *  - alsoSchedule + conexão ATIVA → garante as 4 tools reais de calendário e
 *    remove o fallback `schedule_appointment` (substituído pela agenda real);
 *  - alsoSchedule SEM conexão → garante `schedule_appointment` (registro de
 *    intenção; degradação honesta — NFR-06) e remove as 4 reais (que só
 *    responderiam "agenda não conectada");
 *  - sem alsoSchedule → remove TODAS (4 reais + fallback).
 */
export function deriveCalendarToolChanges(input: {
  alsoSchedule: boolean
  hasActiveConnection: boolean
}): EnabledToolsChange {
  if (!input.alsoSchedule) {
    return {
      ensure: [],
      remove: [...CALENDAR_TOOL_KEYS, SCHEDULE_FALLBACK_TOOL_KEY],
    }
  }
  if (input.hasActiveConnection) {
    return {
      ensure: [...CALENDAR_TOOL_KEYS],
      remove: [SCHEDULE_FALLBACK_TOOL_KEY],
    }
  }
  return { ensure: [SCHEDULE_FALLBACK_TOOL_KEY], remove: [...CALENDAR_TOOL_KEYS] }
}
