/**
 * Cache Redis (TTL 7 dias) do RESULTADO SINTETIZADO da investigação de
 * integração, keyed pelo slug da plataforma.
 *
 * Por quê: a investigação de uma plataforma fora do catálogo é cara (Tavily +
 * síntese LLM) e consome quota `integrationResearch` (T29). Mas o catálogo de
 * APIs de uma plataforma muda devagar — um resultado bom serve por dias. Este
 * cache de 7 dias guarda a SÍNTESE final (endpoints + credenciais + fontes),
 * separado do cache de 1h do `tavily-client.ts` (que cacheia as buscas CRUAS).
 *
 * Cache HIT não consome quota: este módulo só lê/grava — quem decide gastar
 * quota é o caller (T30, `propose_integration`). Um hit aqui faz o caller pular
 * tanto a rede quanto o débito de quota.
 *
 * Fail-open SEMPRE: Redis ausente/erro vira miss no get e no-op no set — nunca
 * derruba a proposta de integração. Espelha o idiom de `tavily-cache.ts`,
 * adicionando uma linha de log (debug/warn) via o logger do repo.
 */

import { logger } from '@/server/services/logger'
import { getRedis } from '@/server/services/redis'

/**
 * Forma SINTETIZADA da investigação (endpoints + credenciais + fontes).
 *
 * TODO(T26): alinhar/importar o tipo canônico de
 * `integration-researcher.prompt.ts` quando T26 existir (o prompt de síntese
 * ainda não foi criado nesta onda). Por ora, interface local mínima — campos
 * mantidos `unknown[]` de propósito: este cache é agnóstico ao shape interno de
 * cada endpoint/credencial; só serializa/desserializa o envelope.
 */
export interface IntegrationResearchResult {
  endpoints: unknown[]
  credentials: unknown[]
  sources?: string[]
}

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 dias
const CACHE_PREFIX = 'integration:research:v1'

/** `integration:research:v1:<slug>` — slug normalizado para lowercase/trim. */
function integrationResearchCacheKey(platformSlug: string): string {
  return `${CACHE_PREFIX}:${platformSlug.trim().toLowerCase()}`
}

/** Type-guard: o JSON guardado é mesmo um envelope de investigação. */
function isResearchResult(value: unknown): value is IntegrationResearchResult {
  if (typeof value !== 'object' || value === null) return false
  const o = value as Record<string, unknown>
  if (!Array.isArray(o.endpoints) || !Array.isArray(o.credentials)) return false
  if (
    o.sources !== undefined &&
    !(Array.isArray(o.sources) && o.sources.every((s) => typeof s === 'string'))
  ) {
    return false
  }
  return true
}

/**
 * Lê a investigação cacheada. `null` em miss/erro/Redis-nulo/lixo (fail-open).
 * Um hit NÃO consome quota — o caller (T30) decide o débito.
 */
export async function getCachedIntegrationResearch(
  platformSlug: string,
): Promise<IntegrationResearchResult | null> {
  const key = integrationResearchCacheKey(platformSlug)
  try {
    const raw = await getRedis().get(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isResearchResult(parsed) ? parsed : null
  } catch (err) {
    logger.debug('[integration-research-cache] get fail-open (miss)', {
      platformSlug: platformSlug.trim().toLowerCase(),
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Grava a investigação (best-effort, TTL 7 dias). No-op em erro/Redis-nulo.
 * Nunca propaga — o cache é puramente acelerador.
 */
export async function setCachedIntegrationResearch(
  platformSlug: string,
  result: IntegrationResearchResult,
): Promise<void> {
  const key = integrationResearchCacheKey(platformSlug)
  try {
    await getRedis().set(key, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS)
  } catch (err) {
    logger.warn('[integration-research-cache] set no-op (best-effort)', {
      platformSlug: platformSlug.trim().toLowerCase(),
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
