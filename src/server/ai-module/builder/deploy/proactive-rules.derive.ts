/**
 * Builder Module — Proactive rules derivation (F1, materialização da PROATIVIDADE)
 *
 * Helper PURO (zero IO, zero `any`) que TRADUZ os 3 toggles opt-in de
 * `builderState.proactive` (a CAPACIDADE "Mensagens proativas" — FR-PRO-01) nas
 * REGRAS de runtime `ScheduledAutomation` (FR-PRO-02). É o "modify" puro do meio do
 * step `materialize_proactive`: o step lê as automações atuais do DB, chama
 * `deriveProactiveRules(proactive)` + `reconcileProactiveRules(existing, desired)` e
 * aplica o plano num `$transaction`. Toda a regra de tradução/reconciliação vive aqui,
 * isolada de DB/Prisma, para ser testável unitariamente.
 *
 * Por que aqui (e não inline no step da saga):
 *  - `ScheduledAutomation` NÃO tem unique (só `@@index([organizationId, projectId])`).
 *    Logo a materialização é um read-modify-reconcile EM MEMÓRIA, exatamente como o
 *    pricing/team. A chave determinística de identidade dentro de
 *    `(organizationId, projectId)` é o `trigger` (1 regra por trigger por projeto).
 *  - A reconciliação NUNCA hard-deleta: regras que sumiram do desired entram em
 *    `toPause` (status='paused') — o scanner futuro (F3/F4) só dispara `status==='active'`.
 *    Preserva histórico e é reversível (re-ativada se o usuário religar o toggle).
 *  - Idempotência: rodar 2x converge (update no-op + re-ativação das mesmas regras).
 *
 * Mapeamento toggle → trigger(s) (FR-49 do mission-first-v3 + enum do spec FR-PRO-02):
 *   - `followUp`       → 1 regra `lead_idle`        (retomar lead parado).
 *   - `reminders`      → 2 regras `appointment_before` + `appointment_after` (agenda).
 *   - `importantDates` → 2 regras `birthday` + `renewal_due` (datas).
 *
 * `messageTemplate` é um TEXTO-BASE determinístico por trigger; o worker de envio
 * (F2b `resolveText`) regenera o texto final via LLM no disparo. SEM PII (NFR-02/LGPD).
 *
 * `proactive` undefined / todos os toggles false → desired VAZIO (clear-on-empty:
 * pausa todas as regras do projeto — espelha o tear-down do pricing/team).
 *
 * Dependency-free: apenas o tipo `ProactiveState` do builder-state. No DB, no `any`.
 */

import type { ProactiveState } from '../cards/builder-state'

// ==========================================
// Vocabulário fechado (espelha o enum do schema/spec — FR-PRO-02)
// ==========================================

/** Triggers válidos de `ScheduledAutomation` (vocabulário fechado do schema). */
export type ProactiveTrigger =
  | 'lead_idle'
  | 'appointment_before'
  | 'appointment_after'
  | 'birthday'
  | 'renewal_due'
  | 'custom_date'

/** Audiência da automação (vocabulário fechado do schema). */
export type ProactiveAudience = 'contact' | 'lead' | 'customer'

/** Regras de cancelamento (vocabulário fechado do schema — compliance NFR-PRO-2). */
export type ProactiveCancelRule =
  | 'customer_replied'
  | 'opted_out'
  | 'human_took_over'
  | 'session_closed'

/**
 * Uma regra `ScheduledAutomation` JÁ NORMALIZADA, pronta para virar/atualizar uma
 * linha. O `timing` é um objeto FECHADO e serializável (vira `Json` no DB); nunca um
 * shape arbitrário vindo do LLM. `messageTemplate` é texto-base determinístico.
 */
export interface DerivedAutomation {
  trigger: ProactiveTrigger
  audience: ProactiveAudience
  /** Shape por trigger (ex.: { hoursIdle: 24 } | { at: '09:00' }). Serializável. */
  timing: Record<string, number | string>
  messageTemplate: string
  cancelRules: ProactiveCancelRule[]
  maxAttempts: number
}

// ==========================================
// deriveProactiveRules (toggles → regras)
// ==========================================

/**
 * Conjunto-base de cancelRules de TODA automação proativa (compliance fail-safe,
 * NFR-PRO-2): para de mandar se o cliente respondeu, optou-out ou um humano assumiu.
 */
const BASE_CANCEL_RULES: ProactiveCancelRule[] = [
  'customer_replied',
  'opted_out',
  'human_took_over',
]

/**
 * deriveProactiveRules — traduz os 3 toggles opt-in em regras de runtime.
 *
 * Pura: não lê DB, não muta o input, sem `any`. `proactive` undefined OU todos os
 * toggles false ⇒ `[]` (clear-on-empty). A ordem é estável (followUp → reminders →
 * importantDates) para testes determinísticos; a identidade é o `trigger`, então a
 * ordem do array não afeta a reconciliação.
 */
export function deriveProactiveRules(
  proactive: ProactiveState | undefined,
): DerivedAutomation[] {
  if (!proactive) return []

  const rules: DerivedAutomation[] = []

  // followUp → retomar lead parado (lead_idle). 1 tentativa por padrão.
  if (proactive.followUp) {
    rules.push({
      trigger: 'lead_idle',
      audience: 'lead',
      timing: { hoursIdle: 24 },
      messageTemplate:
        'Oi! Vi que ficamos sem falar — posso te ajudar a seguir com o que você precisava?',
      cancelRules: [...BASE_CANCEL_RULES],
      maxAttempts: 1,
    })
  }

  // reminders → lembrete antes E acompanhamento depois do compromisso agendado.
  if (proactive.reminders) {
    rules.push({
      trigger: 'appointment_before',
      audience: 'contact',
      timing: { hoursBefore: 2 },
      messageTemplate:
        'Passando para lembrar do seu compromisso. Está tudo certo para você?',
      cancelRules: [...BASE_CANCEL_RULES, 'session_closed'],
      maxAttempts: 1,
    })
    rules.push({
      trigger: 'appointment_after',
      audience: 'contact',
      timing: { hoursAfter: 2 },
      messageTemplate:
        'Como foi o seu atendimento? Se precisar de algo, estou por aqui.',
      cancelRules: [...BASE_CANCEL_RULES, 'session_closed'],
      maxAttempts: 1,
    })
  }

  // importantDates → aniversário + renovação. Audiência 'customer' (cliente ativo).
  if (proactive.importantDates) {
    rules.push({
      trigger: 'birthday',
      audience: 'customer',
      timing: { at: '09:00' },
      messageTemplate:
        'Feliz aniversário! Desejamos um dia incrível para você.',
      cancelRules: [...BASE_CANCEL_RULES],
      maxAttempts: 1,
    })
    rules.push({
      trigger: 'renewal_due',
      audience: 'customer',
      timing: { daysBefore: 7, at: '09:00' },
      messageTemplate:
        'Está chegando a hora de renovar com a gente. Quer que eu te ajude com isso?',
      cancelRules: [...BASE_CANCEL_RULES],
      maxAttempts: 1,
    })
  }

  return rules
}

// ==========================================
// reconcileProactiveRules (read-modify-reconcile por trigger)
// ==========================================

/** Linha mínima que a reconciliação precisa do DB: id + trigger + status. */
export interface ExistingAutomation {
  id: string
  trigger: string
  status: string
}

/** Uma `DerivedAutomation` carimbada com o id da linha existente a atualizar. */
export type AutomationUpdate = DerivedAutomation & { id: string }

/**
 * Plano de reconciliação consumido pelo step `materialize_proactive`:
 *  - `toCreate` → regras novas (presentes no desired, ausentes no DB).
 *  - `toUpdate` → regras que continuam (presentes em ambos); re-ativa + reescreve.
 *  - `toPause`  → ids de regras que sumiram do desired (status='paused', nunca delete).
 */
export interface ProactiveReconcilePlan {
  toCreate: DerivedAutomation[]
  toUpdate: AutomationUpdate[]
  toPause: string[]
}

/**
 * Calcula o plano de reconciliação por TRIGGER (chave de identidade dentro de
 * `(organizationId, projectId)`) entre o que o DB tem hoje (`existing`) e as regras
 * derivadas dos toggles (`desired`).
 *
 * Match-by-trigger:
 *  - presente em `desired` E no DB → `toUpdate` (carimba o id; o step reescreve
 *    timing/template/cancelRules/maxAttempts/audience e re-ativa status='active').
 *  - presente em `desired`, ausente no DB → `toCreate` (linha nova).
 *  - presente no DB, ausente em `desired` → `toPause` (id; status='paused', NUNCA
 *    hard-delete — preserva histórico/reversível; o scanner futuro ignora paused).
 *
 * Robustez (igual ao pricing-reconcile):
 *  - DUAS regras no DB com o mesmo trigger (duplicata histórica) → o PRIMEIRO id é o
 *    alvo do update e os demais entram em `toPause` (converge para 1 ativa por trigger).
 *  - `existing` é tratado como `{ id, trigger, status }[]` (o step seleciona só isso).
 *    O escopo (org+project) é do CALLER (o step filtra no findMany); esta função é
 *    agnóstica — só reconcilia os dois conjuntos que recebe.
 *
 * Pura: não muta os inputs, sem `any`.
 */
export function reconcileProactiveRules(
  existing: readonly ExistingAutomation[],
  desired: readonly DerivedAutomation[],
): ProactiveReconcilePlan {
  // Index do desired por trigger. `desired` já vem deduplicado por trigger (cada
  // toggle gera triggers distintos), mas indexamos defensivamente (last-write-wins).
  const desiredByTrigger = new Map<string, DerivedAutomation>()
  for (const rule of desired) {
    desiredByTrigger.set(rule.trigger, rule)
  }

  // Index do DB por trigger: primeiro id por trigger vira o "alvo"; ids extras
  // (duplicatas históricas) são coletados para pausa independentemente do desired.
  const existingTargetByTrigger = new Map<string, string>()
  const duplicateExistingIds: string[] = []
  for (const row of existing) {
    if (existingTargetByTrigger.has(row.trigger)) {
      duplicateExistingIds.push(row.id)
    } else {
      existingTargetByTrigger.set(row.trigger, row.id)
    }
  }

  const toCreate: DerivedAutomation[] = []
  const toUpdate: AutomationUpdate[] = []
  const toPause: string[] = [...duplicateExistingIds]

  // Regras desejadas: update quando há alvo no DB, create caso contrário.
  for (const [trigger, rule] of desiredByTrigger) {
    const targetId = existingTargetByTrigger.get(trigger)
    if (targetId !== undefined) {
      toUpdate.push({ id: targetId, ...rule })
    } else {
      toCreate.push(rule)
    }
  }

  // Regras do DB (alvos) que sumiram do desired → pausar (nunca deletar).
  for (const [trigger, id] of existingTargetByTrigger) {
    if (!desiredByTrigger.has(trigger)) {
      toPause.push(id)
    }
  }

  return { toCreate, toUpdate, toPause }
}
