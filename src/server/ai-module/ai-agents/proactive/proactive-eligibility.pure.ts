/**
 * proactive-eligibility — NÚCLEO PURO de compliance/elegibilidade do envio
 * PROATIVO (NFR-15 / NFR-PRO-2 — `specs/builder-proatividade/spec.md` §3 FR-PRO-07,
 * §4 NFR-PRO-2; tasks TPRO-13/TPRO-15 lado puro).
 *
 * Por que este módulo existe (a razão de ser):
 *   Antes de QUALQUER envio proativo (follow-up de `create_followup`, lembrete de
 *   agenda, etc.) precisamos decidir se o envio PODE acontecer. Essa decisão é
 *   compliance-crítica e deve ser:
 *     - PURA: zero IO, zero `any`, client-safe — recebe registros simples já
 *       carregados (o ContactOptOut, os campos da ChatSession, o contador de
 *       anti-spam) e devolve a decisão. Quem busca no DB/Redis é o caller
 *       (worker/produtor), NUNCA este módulo.
 *     - FAIL-SAFE (NFR-PRO-2): qualquer dúvida → NÃO envia. Um gate quebrado/
 *       indeciso bloqueia, nunca libera.
 *     - ISOLADA: NÃO importa `webhook/processor`. O predicado de supressão aqui
 *       ESPELHA `canDispatchAgent` (hoje só em `webhook/processor.ts`, caminho
 *       inbound) — TPRO-13 prevê extrair o predicado para um módulo puro
 *       compartilhado; esta é a versão pura ampliada (+ status CLOSED) usada pelo
 *       caminho de saída proativo, SEM acoplar o worker ao processor de inbound.
 *
 * 🔒 INVARIANTES:
 *   - Zero IO / zero `any` / zero import de Prisma/runtime — só tipos estruturais.
 *   - Fail-safe: cada gate, em dúvida, bloqueia. `canSendProactive` combina os
 *     gates na ordem de severidade (opt-out → supressão → anti-spam → janela).
 *   - "Fora da janela de 24h" NÃO é, por si só, um bloqueio: significa que o
 *     envio EXIGE template aprovado (`needsTemplate: true`). Quem decide se há
 *     template é o caminho de envio (FR-PRO-06 / TPRO-50) — aqui só sinalizamos.
 *
 * Os tipos de input são ESTRUTURAIS (shape mínimo) de propósito: aceitam tanto o
 * registro real do Prisma (ContactOptOut, ChatSession) quanto objetos de teste,
 * mantendo o módulo client-safe (sem `import type` do @prisma/client).
 */

// ---------------------------------------------------------------------------
// Shapes estruturais mínimos (subset dos modelos Prisma — client-safe)
// ---------------------------------------------------------------------------

/**
 * Subset de `ContactOptOut` relevante para a decisão. `null` = não há registro
 * de opt-out para o contato (logo, NÃO está opted-out).
 */
export interface OptOutRecord {
  readonly phone: string
}

/**
 * Subset de `ChatSession` relevante para a janela de 24h do WhatsApp
 * (FR-PRO-06). `whatsappWindowExpiresAt` é escrito pelo webhook a cada inbound;
 * `> now` = dentro da janela de sessão (pode enviar texto livre); ausente ou
 * `<= now` = fora da janela (exige template aprovado).
 */
export interface SessionWindowFields {
  readonly whatsappWindowExpiresAt?: Date | null
}

/**
 * Subset de `ChatSession` relevante para os gates de SUPRESSÃO da IA
 * (espelha `canDispatchAgent` + status CLOSED). Suprime quando:
 *   - `aiEnabled === false` (IA desligada na sessão), OU
 *   - `aiBlockedUntil > now` (IA pausada temporariamente — ex.: humano assumiu), OU
 *   - `status === 'CLOSED'` (sessão encerrada).
 */
export interface SessionSuppressionFields {
  readonly aiEnabled?: boolean
  readonly aiBlockedUntil?: Date | null
  readonly status?: string
}

/** Motivo do bloqueio, em vocabulário fechado (auditável). */
export type ProactiveBlockReason =
  | 'opted_out'
  | 'suppressed'
  | 'anti_spam'
  | 'outside_window_no_template'

export interface CanSendProactiveInput {
  /** Registro de opt-out do contato, ou `null` quando não existe. */
  readonly optOut: OptOutRecord | null
  /** Campos da sessão para a janela de 24h. */
  readonly session: SessionWindowFields & SessionSuppressionFields
  /** Momento de referência da decisão (injetado p/ pureza/testabilidade). */
  readonly now: Date
  /** Quantos envios proativos consecutivos houve SEM resposta do contato. */
  readonly consecutiveProactiveWithoutReply: number
  /** Máximo de envios proativos consecutivos sem resposta permitidos. */
  readonly maxAttempts: number
  /**
   * Há template aprovado disponível para usar FORA da janela de 24h?
   * Default `false` (fail-safe): sem template conhecido, fora da janela bloqueia.
   * O caminho de envio (TPRO-50/51) é quem realmente conhece o catálogo de HSM.
   */
  readonly hasApprovedTemplate?: boolean
}

export interface CanSendProactiveResult {
  readonly allowed: boolean
  readonly reason?: ProactiveBlockReason
  /**
   * Só relevante quando `allowed === true`: indica que o envio está FORA da
   * janela de 24h e, portanto, DEVE ser feito via template aprovado.
   */
  readonly needsTemplate?: boolean
}

// ---------------------------------------------------------------------------
// Gates individuais (puros, testáveis isoladamente)
// ---------------------------------------------------------------------------

/**
 * Contato optou por sair? `null` = sem registro = NÃO optou.
 * (O caller já filtrou o opt-out por `(organizationId, phone)` ao buscá-lo;
 * a mera EXISTÊNCIA do registro significa opted-out.)
 */
export function isOptedOut(optOut: OptOutRecord | null): boolean {
  return optOut !== null
}

/**
 * A sessão está DENTRO da janela de 24h do WhatsApp?
 *   - `whatsappWindowExpiresAt` ausente/null → FORA (fail-safe: precisa template).
 *   - `whatsappWindowExpiresAt > now`         → DENTRO (texto livre liberado).
 *   - `whatsappWindowExpiresAt <= now`        → FORA (janela expirou).
 */
export function isWithin24hWindow(
  session: SessionWindowFields,
  now: Date,
): boolean {
  const expiresAt = session.whatsappWindowExpiresAt
  if (!expiresAt) {
    return false
  }
  return expiresAt.getTime() > now.getTime()
}

/**
 * A IA está SUPRIMIDA nesta sessão? (espelha `canDispatchAgent` + status CLOSED)
 * `true` quando QUALQUER uma das condições de supressão for verdadeira:
 *   - `aiEnabled === false`
 *   - `aiBlockedUntil > now`
 *   - `status === 'CLOSED'`
 *
 * NÃO importa o `webhook/processor` (invariante de isolamento — TPRO-13).
 */
export function isAiSuppressed(
  session: SessionSuppressionFields,
  now: Date,
): boolean {
  if (session.aiEnabled === false) {
    return true
  }

  const blockedUntil = session.aiBlockedUntil
  if (blockedUntil && blockedUntil.getTime() > now.getTime()) {
    return true
  }

  if (session.status === 'CLOSED') {
    return true
  }

  return false
}

/**
 * O contador de envios proativos consecutivos sem resposta excedeu o máximo?
 * Anti-spam reply-aware (FR-PRO-07): "máximo N envios proativos consecutivos SEM
 * resposta inbound". Atingir o teto JÁ bloqueia o próximo (`>=`).
 *
 * Fail-safe: `maxAttempts <= 0` (config inválida/ausente) → SEMPRE excede
 * (bloqueia tudo) em vez de liberar envios ilimitados.
 */
export function exceededAntiSpam(
  consecutiveProactiveWithoutReply: number,
  maxAttempts: number,
): boolean {
  if (!Number.isFinite(maxAttempts) || maxAttempts <= 0) {
    return true
  }
  if (
    !Number.isFinite(consecutiveProactiveWithoutReply) ||
    consecutiveProactiveWithoutReply < 0
  ) {
    // Contador corrompido/indefinido → fail-safe: bloqueia.
    return true
  }
  return consecutiveProactiveWithoutReply >= maxAttempts
}

// ---------------------------------------------------------------------------
// Decisão combinada (fail-safe)
// ---------------------------------------------------------------------------

/**
 * Decide se um envio proativo PODE acontecer, combinando todos os gates.
 *
 * Ordem (severidade decrescente — o primeiro bloqueio vence e é reportado):
 *   1. opt-out          → `opted_out`
 *   2. supressão da IA  → `suppressed`
 *   3. anti-spam        → `anti_spam`
 *   4. janela de 24h    → DENTRO: libera (texto livre).
 *                          FORA + template: libera com `needsTemplate: true`.
 *                          FORA sem template: bloqueia `outside_window_no_template`.
 *
 * Fail-safe: qualquer condição duvidosa em um gate já resolve para bloqueio
 * dentro do próprio gate (ver `exceededAntiSpam`, `isWithin24hWindow`).
 */
export function canSendProactive(
  input: CanSendProactiveInput,
): CanSendProactiveResult {
  if (isOptedOut(input.optOut)) {
    return { allowed: false, reason: 'opted_out' }
  }

  if (isAiSuppressed(input.session, input.now)) {
    return { allowed: false, reason: 'suppressed' }
  }

  if (
    exceededAntiSpam(input.consecutiveProactiveWithoutReply, input.maxAttempts)
  ) {
    return { allowed: false, reason: 'anti_spam' }
  }

  const withinWindow = isWithin24hWindow(input.session, input.now)
  if (withinWindow) {
    return { allowed: true, needsTemplate: false }
  }

  // Fora da janela: só pode com template aprovado.
  if (input.hasApprovedTemplate === true) {
    return { allowed: true, needsTemplate: true }
  }

  return { allowed: false, reason: 'outside_window_no_template' }
}
