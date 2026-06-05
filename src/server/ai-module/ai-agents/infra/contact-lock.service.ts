/**
 * Contact Lock Service — QH-04
 *
 * Lock distribuído por contato via Redis para serializar turnos concorrentes
 * de um mesmo lead. Evita que 2 mensagens próximas do mesmo contato gerem
 * respostas fora de ordem (race condition no histórico LLM).
 *
 * Estratégia:
 *   - Aquisição: SET key token NX PX ttl (atômico, sem transação Postgres).
 *   - Release: script Lua compare-and-delete — só apaga se o token bate.
 *     Evita que um turno mais lento libere o lock de outro turno.
 *   - Chave: wa:lock:{organizationId}:{contactPhone}
 *   - Token único por aquisição: crypto.randomUUID()
 *   - TTL default: 60 000 ms (protege contra crash sem release).
 *
 * FAIL-OPEN intencional:
 *   - Redis indisponível → acquired=true, token=null.
 *     O turno prossegue sem serialização (degrada com segurança).
 *   - release com token=null → no-op silencioso.
 *   - Nunca lança exceção.
 *
 * Decisão de design (ver backlog QH-04):
 *   pg_advisory_xact_lock foi descartado — exige manter uma transação Postgres
 *   aberta durante a chamada LLM (segundos), esgotando o pool de conexões.
 *
 * @module infra/contact-lock.service
 */

import { z } from 'zod'
import { getRedis } from '@/server/services/redis'
import { logger } from '@/server/services/logger'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Prefixo da chave Redis de lock por contato. */
const LOCK_KEY_PREFIX = 'wa:lock'

/** TTL padrão em milissegundos (60 s). Protege contra crash sem release. */
const DEFAULT_TTL_MS = 60_000

// ── Script Lua — compare-and-delete atômico ───────────────────────────────────
//
// KEYS[1]  = chave do lock  (ex: "wa:lock:org-abc:+5511999999999")
// ARGV[1]  = token esperado (UUID do turno que detém o lock)
//
// Retorna: 1 se apagou (token batia), 0 se não apagou (token diferente ou
//          chave inexistente).
//
// Garante que apenas o detentor original libera o lock, mesmo que o TTL
// ainda não tenha expirado.

const RELEASE_LUA = `
local current = redis.call('GET', KEYS[1])
if current == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`

// ── Input Schemas ─────────────────────────────────────────────────────────────

const AcquireInputSchema = z.object({
  organizationId: z.string().min(1),
  contactPhone: z.string().min(1),
  ttlMs: z.number().int().positive().optional(),
})

const ReleaseInputSchema = z.object({
  organizationId: z.string().min(1),
  contactPhone: z.string().min(1),
  token: z.string().min(1),
})

export type AcquireContactLockInput = z.infer<typeof AcquireInputSchema>
export type ReleaseContactLockInput = z.infer<typeof ReleaseInputSchema>

// ── Output Types ──────────────────────────────────────────────────────────────

export interface AcquireContactLockResult {
  /** true → lock adquirido (turno pode prosseguir). */
  acquired: boolean
  /**
   * UUID da aquisição, necessário para o release.
   * null apenas no modo fail-open (Redis indisponível): release vira no-op.
   */
  token: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildKey(organizationId: string, contactPhone: string): string {
  return `${LOCK_KEY_PREFIX}:${organizationId}:${contactPhone}`
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Tenta adquirir o lock distribuído para o contato.
 *
 * - Se o lock está livre → adquire (SET NX), retorna { acquired: true, token }.
 * - Se outro turno já detém o lock → { acquired: false, token: null }.
 * - Redis indisponível → fail-open: { acquired: true, token: null }.
 *
 * O caller deve envolver o turno em try/finally e chamar releaseContactLock
 * no bloco finally com o token recebido.
 *
 * @param input - { organizationId, contactPhone, ttlMs? }
 */
export async function acquireContactLock(
  input: AcquireContactLockInput,
): Promise<AcquireContactLockResult> {
  const parsed = AcquireInputSchema.safeParse(input)
  if (!parsed.success) {
    logger.warn('[ContactLock] Input inválido em acquireContactLock (fail-open)', {
      errors: parsed.error.issues,
    })
    return { acquired: true, token: null }
  }

  const { organizationId, contactPhone, ttlMs = DEFAULT_TTL_MS } = parsed.data
  const key = buildKey(organizationId, contactPhone)
  const token = crypto.randomUUID()

  try {
    const redis = getRedis()

    // SET key token PX ttlMs NX — atômico, fail-fast, sem bloqueio
    // Ordem ioredis: (key, value, 'PX', ms, 'NX') — PX deve vir antes de NX
    const result = await redis.set(key, token, 'PX', ttlMs, 'NX')

    if (result === null) {
      // Outra instância detém o lock
      logger.info('[ContactLock] Lock não adquirido — turno concorrente detectado', {
        organizationId,
        contactPhone: contactPhone.slice(-4), // mascara o número nos logs
        key,
      })
      return { acquired: false, token: null }
    }

    return { acquired: true, token }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn('[ContactLock] Redis indisponível em acquireContactLock (fail-open)', {
      organizationId,
      error: message,
    })
    // Fail-open: degrada para sem-lock; release será no-op
    return { acquired: true, token: null }
  }
}

/**
 * Libera o lock do contato se e somente se o token bate (compare-and-delete).
 *
 * - token=null (fail-open path) → no-op silencioso.
 * - Token errado → Redis não apaga; loga warn.
 * - Redis indisponível → loga warn, nunca lança.
 *
 * @param input - { organizationId, contactPhone, token }
 */
export async function releaseContactLock(
  input: ReleaseContactLockInput,
): Promise<void> {
  const parsed = ReleaseInputSchema.safeParse(input)
  if (!parsed.success) {
    // token vazio ou input inválido → no-op (cobre o token=null do fail-open)
    return
  }

  const { organizationId, contactPhone, token } = parsed.data
  const key = buildKey(organizationId, contactPhone)

  try {
    const redis = getRedis()

    const deleted = await redis.eval(RELEASE_LUA, 1, key, token)

    if (deleted !== 1) {
      logger.warn('[ContactLock] releaseContactLock: token não bateu ou lock expirado', {
        organizationId,
        contactPhone: contactPhone.slice(-4),
        key,
      })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn('[ContactLock] Redis indisponível em releaseContactLock (ignorado)', {
      organizationId,
      error: message,
    })
  }
}
