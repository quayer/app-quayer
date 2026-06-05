/**
 * outbound-rate-limit — token-bucket simplificado (janela fixa) para o envio
 * OUTBOUND do agente. Padrão Orayon: limita por contato E por organização.
 *
 * Estratégia:
 *   - Janela fixa de 60s, contador via INCR + EXPIRE no Redis.
 *   - Chave por contato: `outbound:rl:contact:{org}:{phone}` (default 10/min).
 *   - Chave por org:     `outbound:rl:org:{org}`            (default 100/min).
 *   - Multi-tenant: toda chave é prefixada por organizationId.
 *
 * Fail-safe: Redis fora do ar → NÃO bloqueia o envio (retorna allowed=true).
 * Perder um limite ocasional é menos pior que travar todas as respostas do
 * agente por falha de infra.
 */

import { getRedis } from '@/server/services/redis'

/** Janela fixa em segundos. */
const WINDOW_SECONDS = 60

/** Limite default por contato dentro da janela. */
const DEFAULT_CONTACT_LIMIT = 10

/** Limite default por org dentro da janela. */
const DEFAULT_ORG_LIMIT = 100

export interface RateLimitConfig {
  /** Máximo de mensagens por contato na janela. */
  contactLimit?: number
  /** Máximo de mensagens por org na janela. */
  orgLimit?: number
  /** Tamanho da janela em segundos. */
  windowSeconds?: number
}

export interface RateLimitResult {
  /** `true` se o envio está liberado; `false` se algum limite estourou. */
  allowed: boolean
  /** Escopo que estourou (quando `allowed=false`). */
  scope?: 'contact' | 'org'
  /** Contagem atual da chave que estourou. */
  current?: number
  /** Limite configurado para a chave que estourou. */
  limit?: number
}

function contactKey(organizationId: string, contactPhone: string): string {
  return `outbound:rl:contact:${organizationId}:${contactPhone}`
}

function orgKey(organizationId: string): string {
  return `outbound:rl:org:${organizationId}`
}

/**
 * Incrementa o contador da chave e garante o TTL da janela.
 * Define EXPIRE apenas na primeira ocorrência (count === 1) para não
 * "deslizar" a janela a cada incremento.
 */
async function incrWithWindow(
  redis: ReturnType<typeof getRedis>,
  key: string,
  windowSeconds: number,
): Promise<number> {
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, windowSeconds)
  }
  return count
}

/**
 * Verifica e consome cota de envio para (org, contato). Incrementa ambos os
 * contadores. Retorna `allowed=false` no primeiro limite que estourar.
 *
 * IMPORTANTE: este check é consumptivo (faz INCR). Chame uma vez por turno de
 * envio, antes de despachar os blocos — não dentro do loop de blocos.
 */
export async function checkOutboundRateLimit(
  organizationId: string,
  contactPhone: string,
  config: RateLimitConfig = {},
): Promise<RateLimitResult> {
  const contactLimit = config.contactLimit ?? DEFAULT_CONTACT_LIMIT
  const orgLimit = config.orgLimit ?? DEFAULT_ORG_LIMIT
  const windowSeconds = config.windowSeconds ?? WINDOW_SECONDS

  if (!organizationId || !contactPhone) {
    // Sem identidade não dá para isolar tenant — não arrisca limitar errado.
    return { allowed: true }
  }

  try {
    const redis = getRedis()

    const contactCount = await incrWithWindow(
      redis,
      contactKey(organizationId, contactPhone),
      windowSeconds,
    )
    if (contactCount > contactLimit) {
      return {
        allowed: false,
        scope: 'contact',
        current: contactCount,
        limit: contactLimit,
      }
    }

    const orgCount = await incrWithWindow(redis, orgKey(organizationId), windowSeconds)
    if (orgCount > orgLimit) {
      return {
        allowed: false,
        scope: 'org',
        current: orgCount,
        limit: orgLimit,
      }
    }

    return { allowed: true }
  } catch (err) {
    // Fail-open: Redis down não pode travar o agente.
    console.warn(
      '[outbound] rate-limit check failed (fail-open):',
      err instanceof Error ? err.message : String(err),
    )
    return { allowed: true }
  }
}
