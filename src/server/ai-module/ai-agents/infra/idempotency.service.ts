/**
 * Idempotency Service — QH-01
 *
 * Gate de deduplicação de webhooks WhatsApp no início do pipeline inbound.
 *
 * Estratégia:
 *   - Redis SET NX (atômico) na chave `wa:dedup:{connectionId}:{waMessageId}` com TTL 24h.
 *   - Se a chave já existia → isDuplicate: true (mensagem vista antes).
 *   - Se não existia → marca como processada e retorna isDuplicate: false.
 *   - FAIL-OPEN: qualquer erro de Redis → loga warn e retorna isDuplicate: false.
 *     Nunca lança exceção. A durabilidade final é garantida pelo unique constraint
 *     Message.waMessageId no Postgres (insert-first pattern).
 *
 * Referência: docs/backlog/QUAYER_HARDENING_BACKLOG.md — QH-01
 *
 * @module infra/idempotency.service
 */

import { z } from 'zod'
import { getRedis } from '@/server/services/redis'
import { logger } from '@/server/services/logger'

// ── Constants ─────────────────────────────────────────────────────────────────

/** TTL em segundos para a chave de deduplicação (24 horas). */
const DEDUP_TTL_SECONDS = 60 * 60 * 24

/** Prefixo da chave Redis para deduplicação de webhooks WhatsApp. */
const DEDUP_KEY_PREFIX = 'wa:dedup'

/** Valor armazenado na chave (apenas precisa existir; o conteúdo é irrelevante). */
const DEDUP_KEY_VALUE = '1'

// ── Input Schema ─────────────────────────────────────────────────────────────

export const CheckAndMarkProcessedInputSchema = z.object({
  /** ID da conexão WhatsApp (instância UAZ). */
  connectionId: z.string().min(1),
  /** ID único da mensagem atribuído pelo WhatsApp/UAZAPI. */
  waMessageId: z.string().min(1),
})

export type CheckAndMarkProcessedInput = z.infer<
  typeof CheckAndMarkProcessedInputSchema
>

// ── Output Type ───────────────────────────────────────────────────────────────

export interface IdempotencyResult {
  /** true se a mensagem já foi processada antes; false se é nova (ou Redis falhou). */
  isDuplicate: boolean
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verifica se a mensagem já foi processada e, se não, marca-a como processada.
 *
 * Comportamento:
 *   - Primeira chamada com o par (connectionId, waMessageId): SET NX bem-sucedido
 *     → retorna { isDuplicate: false }.
 *   - Chamadas subsequentes com o mesmo par: SET NX falha (chave existe)
 *     → retorna { isDuplicate: true }.
 *   - Erro de Redis (conexão, timeout, etc.): retorna { isDuplicate: false }
 *     com log warn. Nunca lança. O fallback conservador (fail-open) é intencional:
 *     preferimos processar a mensagem duas vezes a silenciar uma mensagem nova.
 *
 * @param input - Dados validados pelo Zod schema.
 * @returns Promise<IdempotencyResult>
 */
export async function checkAndMarkProcessed(
  input: CheckAndMarkProcessedInput,
): Promise<IdempotencyResult> {
  const parsed = CheckAndMarkProcessedInputSchema.safeParse(input)

  if (!parsed.success) {
    logger.warn(
      '[idempotency] Input inválido, tratando como não-duplicado (fail-open)',
      { errors: parsed.error.issues },
    )
    return { isDuplicate: false }
  }

  const { connectionId, waMessageId } = parsed.data
  const key = `${DEDUP_KEY_PREFIX}:${connectionId}:${waMessageId}`

  try {
    const redis = getRedis()

    // SET NX EX é atômico: define a chave apenas se ela ainda não existir.
    // Retorna 'OK' quando a chave foi criada, null quando já existia.
    const result = await redis.set(key, DEDUP_KEY_VALUE, 'EX', DEDUP_TTL_SECONDS, 'NX')

    if (result === null) {
      // Chave já existia → mensagem duplicada.
      logger.info(
        '[idempotency] Mensagem duplicada detectada — descartando',
        { connectionId, waMessageId, key },
      )
      return { isDuplicate: true }
    }

    // Chave criada com sucesso → primeira ocorrência.
    return { isDuplicate: false }
  } catch (err: unknown) {
    // FAIL-OPEN: erros de Redis nunca devem bloquear o pipeline.
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(
      '[idempotency] Erro ao acessar Redis — tratando como não-duplicado (fail-open)',
      { connectionId, waMessageId, error: message },
    )
    return { isDuplicate: false }
  }
}
