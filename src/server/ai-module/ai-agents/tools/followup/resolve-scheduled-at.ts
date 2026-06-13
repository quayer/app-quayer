/**
 * resolve-scheduled-at — parser PURO do `scheduledAt` da tool create_followup
 * (TPRO-01). O LLM pode passar:
 *   - um ISO absoluto:  "2026-06-14T09:00:00.000Z"
 *   - um OFFSET relativo a agora: "+2h" | "+30m" | "+1d" | "+90s"
 *
 * Puro (zero IO, zero `any`): recebe a string + o `now` injetado e devolve a
 * data alvo. Fail-safe: entrada inválida → `null` (o caller recusa e NÃO agenda).
 *
 * Unidades suportadas no offset: s (segundos), m (minutos), h (horas), d (dias).
 * O sinal '+' é opcional ("2h" == "+2h"). Offset deve ser > 0.
 */

const OFFSET_RE = /^\+?(\d+)\s*(s|m|h|d)$/i

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
}

export interface ResolveScheduledAtResult {
  /** Data alvo do envio. */
  readonly at: Date
  /** Atraso em ms a partir de `now` (>= 0). */
  readonly delayMs: number
}

/**
 * Resolve `scheduledAt` (ISO ou offset) para uma data futura + delay em ms.
 * Retorna `null` quando:
 *   - a string é vazia/indecifrável (nem ISO válido nem offset),
 *   - o offset é <= 0,
 *   - a data resolvida é NO PASSADO (<= now) — follow-up só faz sentido futuro.
 */
export function resolveScheduledAt(
  scheduledAt: string,
  now: Date,
): ResolveScheduledAtResult | null {
  const raw = scheduledAt.trim()
  if (raw.length === 0) {
    return null
  }

  const nowMs = now.getTime()

  // 1) Tenta offset relativo (+2h, 30m, +1d, ...).
  const offsetMatch = OFFSET_RE.exec(raw)
  if (offsetMatch) {
    const amount = Number.parseInt(offsetMatch[1], 10)
    const unit = offsetMatch[2].toLowerCase()
    const unitMs = UNIT_MS[unit]
    if (!Number.isFinite(amount) || amount <= 0 || !unitMs) {
      return null
    }
    const delayMs = amount * unitMs
    return { at: new Date(nowMs + delayMs), delayMs }
  }

  // 2) Tenta ISO absoluto.
  const parsed = new Date(raw)
  const ms = parsed.getTime()
  if (Number.isNaN(ms)) {
    return null
  }
  if (ms <= nowMs) {
    // Data no passado/agora — follow-up tem que ser futuro.
    return null
  }
  return { at: parsed, delayMs: ms - nowMs }
}
