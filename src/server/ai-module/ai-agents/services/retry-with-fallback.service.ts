/**
 * Retry com exponential backoff e troca para fallback model.
 *
 * Inspirado em `inspiration/claude-code-leak/src/services/api/withRetry.ts`,
 * mas drasticamente simplificado para o caso de uso Quayer:
 *
 *   - sem AbortSignal (caller pode usar Promise.race)
 *   - sem heartbeat (timeouts WhatsApp são curtos, ~30s)
 *   - sem fast-mode / Bedrock / Vertex
 *   - sem jitter (determinístico para fakeTimers em testes)
 *
 * Após `maxAttempts/2` falhas retriable do `primaryFn`, troca para
 * `fallbackFn` (se fornecido) — útil quando o modelo primário (ex.: gpt-4o)
 * está sob 429 e queremos cair para gpt-4o-mini.
 *
 * Errors não-retriable (HTTP 4xx exceto 429, AbortError) são propagados
 * imediatamente sem retry.
 *
 * QH-06: quando `circuitBreaker` está presente, cada tentativa consulta
 * `canAttempt` antes de chamar a fn. Circuit aberto → pula p/ fallback
 * imediatamente; sucesso → `recordSuccess`; falha retriable → `recordFailure`.
 */

// ── QH-06: Circuit Breaker import ─────────────────────────────────────────────
import {
  canAttempt,
  recordSuccess,
  recordFailure,
} from '../infra/circuit-breaker.service'

export interface RetryOptions {
  /** Tentativas totais no primary (default 3). */
  maxAttempts?: number
  /** Delay base do backoff em ms (default 500). */
  baseDelayMs?: number
  /** Delay máximo do backoff em ms (default 5000). */
  maxDelayMs?: number
  /** Se setado, é apenas metadata informativa (qual modelo o fallbackFn usa). */
  fallbackModel?: string
  /** Override do classificador retriable. */
  isRetriable?: (err: unknown) => boolean
  /**
   * QH-06: se presente, o circuit breaker é consultado antes de cada tentativa
   * e atualizado após sucesso/falha. Fail-open: erros do Redis não bloqueiam.
   */
  circuitBreaker?: {
    primaryProvider: string
    primaryModel: string
    /** Provider do fallbackFn (default: mesmo do primary). */
    fallbackProvider?: string
    /** Modelo do fallbackFn — pode ser o mesmo de options.fallbackModel. */
    fallbackModel?: string
  }
}

export interface RetryResult<T> {
  data?: T
  error?: unknown
  /** Quantas chamadas a fn foram feitas no total (primary + fallback). */
  attemptsUsed: number
  /** true se a resposta veio do fallbackFn. */
  usedFallback: boolean
  /** Latência total wall-clock incluindo backoffs. */
  totalLatencyMs: number
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 500
const DEFAULT_MAX_DELAY_MS = 5_000

const RETRIABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'])

/**
 * Classifica erro como retriable.
 *
 * Retriable:
 *   - HTTP 429 (rate limit)
 *   - HTTP 5xx (server error)
 *   - code: ECONNRESET / ETIMEDOUT / EAI_AGAIN
 *
 * NÃO retriable:
 *   - HTTP 4xx (exceto 429)
 *   - AbortError (usuário cancelou)
 *   - null / undefined / primitivos
 */
export function isRetriableError(err: unknown): boolean {
  if (err === null || err === undefined) return false
  if (typeof err !== 'object') return false

  const e = err as { status?: unknown; code?: unknown; name?: unknown }

  if (e.name === 'AbortError') return false

  if (typeof e.code === 'string' && RETRIABLE_CODES.has(e.code)) {
    return true
  }

  if (typeof e.status === 'number') {
    if (e.status === 429) return true
    if (e.status >= 500 && e.status < 600) return true
    return false
  }

  return false
}

function computeBackoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  // attempt é 1-based; o 1º backoff é base * 2^0 = base.
  const exp = Math.pow(2, attempt - 1)
  return Math.min(baseDelayMs * exp, maxDelayMs)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Executa `primaryFn` com retries exponential backoff. Após metade dos
 * attempts (arredondado para baixo) com falha retriable, troca para
 * `fallbackFn` se fornecido — fica com ele até esgotar attempts.
 *
 * Errors não-retriable param o loop imediatamente.
 */
export async function retryWithFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: (() => Promise<T>) | null,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const isRetriable = options.isRetriable ?? isRetriableError
  const fallbackThreshold = Math.floor(maxAttempts / 2)
  const cb = options.circuitBreaker ?? null

  const startedAt = Date.now()
  let lastError: unknown
  let attemptsUsed = 0
  let usedFallback = false

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Decide qual fn usar nesta tentativa. Se já queimamos
    // fallbackThreshold falhas retriable do primary e há fallback, troca.
    const shouldUseFallback =
      fallbackFn !== null && attempt > fallbackThreshold && !usedFallback
    if (shouldUseFallback) {
      usedFallback = true
    }

    // QH-06: resolve provider/model para este attempt e consulta o circuit.
    const cbProvider = usedFallback
      ? (cb?.fallbackProvider ?? cb?.primaryProvider ?? '')
      : (cb?.primaryProvider ?? '')
    const cbModel = usedFallback
      ? (cb?.fallbackModel ?? cb?.primaryModel ?? '')
      : (cb?.primaryModel ?? '')

    if (cb && cbProvider && cbModel) {
      const circuit = await canAttempt({ provider: cbProvider, model: cbModel })
      if (!circuit.allowed) {
        // Circuit OPEN: pula para fallback se disponível, ou esgota o loop.
        if (!usedFallback && fallbackFn !== null) {
          usedFallback = true
          // Continua a iteração usando o fallbackFn.
        } else {
          // Sem fallback restante — retorna como erro retriable sem tentar.
          lastError = new Error(
            `[circuit-breaker] circuit open for ${cbProvider}/${cbModel} — skipped`,
          )
          break
        }
      }
    }

    const fn = usedFallback && fallbackFn ? fallbackFn : primaryFn
    attemptsUsed++

    try {
      const data = await fn()
      // QH-06: registra sucesso no circuit breaker.
      if (cb && cbProvider && cbModel) {
        await recordSuccess({ provider: cbProvider, model: cbModel })
      }
      return {
        data,
        attemptsUsed,
        usedFallback,
        totalLatencyMs: Date.now() - startedAt,
      }
    } catch (err) {
      lastError = err

      // Não-retriable: propaga imediatamente (sem recordFailure — não é falha do provider).
      if (!isRetriable(err)) {
        return {
          error: err,
          attemptsUsed,
          usedFallback,
          totalLatencyMs: Date.now() - startedAt,
        }
      }

      // QH-06: registra falha retriable no circuit breaker.
      if (cb && cbProvider && cbModel) {
        await recordFailure({ provider: cbProvider, model: cbModel })
      }

      // Última tentativa? Não dorme, só sai do loop.
      if (attempt >= maxAttempts) break

      const delayMs = computeBackoffMs(attempt, baseDelayMs, maxDelayMs)
      await sleep(delayMs)
    }
  }

  return {
    error: lastError,
    attemptsUsed,
    usedFallback,
    totalLatencyMs: Date.now() - startedAt,
  }
}
