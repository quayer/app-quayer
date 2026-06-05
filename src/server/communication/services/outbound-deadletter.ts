/**
 * outbound-deadletter — resiliência de envio OUTBOUND (padrão Orayon):
 *   1. Retry com backoff exponencial (2^n * 500ms, cap 30s, máx 3 tentativas).
 *   2. Dead-letter: ao esgotar, empurra o payload numa Redis list para
 *      visibilidade de ops (LPUSH + LTRIM com cap ~1000).
 *
 * Fail-safe: tudo é defensivo. Redis down ou falha de serialização NÃO
 * derrubam o turno de envio do agente — apenas logam.
 *
 * Multi-tenant: o payload da dead-letter carrega organizationId; a list é
 * global de ops (`outbound:deadletter`) por design (visibilidade operacional
 * agregada), mas cada entrada é tenant-attribuída.
 */

import { getRedis } from '@/server/services/redis'
import type { SendResult } from './uazapi-sender.service'

/** Chave da Redis list de dead-letter (visibilidade de ops). */
const DEADLETTER_KEY = 'outbound:deadletter'

/** Cap da list de dead-letter (mantém só as N mais recentes). */
const DEADLETTER_CAP = 1000

/** Máximo de tentativas (1 inicial + retries até atingir este total). */
const MAX_ATTEMPTS = 3

/** Base do backoff em ms: 2^n * 500ms. */
const BACKOFF_BASE_MS = 500

/** Teto do backoff em ms. */
const BACKOFF_CAP_MS = 30_000

export interface DeadLetterPayload {
  organizationId: string
  phone: string
  text: string
  error: string
  timestamp: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Backoff exponencial: 2^attempt * base, com teto. attempt começa em 0. */
export function backoffDelayMs(attempt: number): number {
  return Math.min(Math.pow(2, attempt) * BACKOFF_BASE_MS, BACKOFF_CAP_MS)
}

/**
 * Empurra um payload na dead-letter list (LPUSH) e apara para o cap (LTRIM).
 * Defensivo: nunca lança — falha de Redis só loga.
 */
export async function pushDeadLetter(payload: DeadLetterPayload): Promise<void> {
  try {
    const redis = getRedis()
    await redis.lpush(DEADLETTER_KEY, JSON.stringify(payload))
    // Mantém apenas os DEADLETTER_CAP itens mais recentes (índices 0..cap-1).
    await redis.ltrim(DEADLETTER_KEY, 0, DEADLETTER_CAP - 1)
  } catch (err) {
    console.error(
      '[outbound] dead-letter push failed:',
      err instanceof Error ? err.message : String(err),
    )
  }
}

/**
 * Executa um envio com retry + backoff exponencial. `send` deve retornar um
 * `SendResult` ({ success, messageId?, error? }) e/ou lançar — ambos os casos
 * são tratados como falha e disparam retry.
 *
 * Em sucesso: retorna o `SendResult` imediatamente.
 * Ao esgotar tentativas: empurra para dead-letter (com org/phone/text/erro/ts)
 * e retorna o último `SendResult` de falha — NÃO derruba o turno.
 */
export async function sendWithRetry(
  send: () => Promise<SendResult>,
  dlContext: { organizationId: string; phone: string; text: string },
  opts: { maxAttempts?: number } = {},
): Promise<SendResult> {
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS
  let lastError = 'unknown send error'
  let lastResult: SendResult = { success: false, error: lastError }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await send()
      if (result.success) {
        return result
      }
      lastResult = result
      lastError = result.error ?? 'unknown send error'
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      lastResult = { success: false, error: lastError }
    }

    // Backoff entre tentativas (não espera após a última).
    if (attempt < maxAttempts - 1) {
      await sleep(backoffDelayMs(attempt))
    }
  }

  // Esgotou: dead-letter para visibilidade de ops + log de erro.
  await pushDeadLetter({
    organizationId: dlContext.organizationId,
    phone: dlContext.phone,
    text: dlContext.text,
    error: lastError,
    timestamp: new Date().toISOString(),
  })
  console.error(
    `[outbound] dead-letter org=${dlContext.organizationId} phone=${dlContext.phone}: ${lastError}`,
  )

  return lastResult
}
