/**
 * Cache Redis compartilhado das buscas Tavily (search_web + niche-researcher).
 *
 * Por quê: hoje ZERO cache em qualquer caminho Tavily — todo search bate na API
 * paga, e o meta-agente costuma pesquisar o mesmo nicho várias vezes na mesma
 * sessão de onboarding. Cache curto (1h) keyed por (search_depth, maxResults,
 * query normalizada). Espelha o `web_search.py` do Orayon.Profissoes.
 *
 * Os dois clients Tavily normalizam para a MESMA forma ({title,url,snippet}),
 * então um único módulo serve ambos sem acoplar seus contratos de retorno.
 *
 * Fail-open SEMPRE: Redis ausente/erro vira miss — nunca derruba a busca. Não
 * cacheia lista vazia (lição do Apify: evita mascarar um retorno transitório de
 * zero resultados como se fosse definitivo).
 */

import type Redis from 'ioredis'

import { hash } from '@/lib/crypto'

/** Client mínimo — facilita injeção/mocks no teste. */
type RedisLike = Pick<Redis, 'get' | 'set'>

/** Forma normalizada comum aos dois clients Tavily. */
export interface TavilyCacheItem {
  title: string
  url: string
  snippet: string
}

const CACHE_TTL_SECONDS = 60 * 60 // 1h
const CACHE_PREFIX = 'tavily'

/** `tavily:<sha256(depth|max|query)>` — params na key p/ não misturar variantes. */
export function tavilyCacheKey(
  query: string,
  maxResults: number,
  searchDepth: string,
): string {
  const normalized = `${searchDepth}|${maxResults}|${query.trim().toLowerCase()}`
  return `${CACHE_PREFIX}:${hash(normalized)}`
}

/** Valida que o JSON guardado é mesmo um array de itens bem-formados. */
function isItems(value: unknown): value is TavilyCacheItem[] {
  if (!Array.isArray(value)) return false
  return value.every((v) => {
    if (typeof v !== 'object' || v === null) return false
    const o = v as Record<string, unknown>
    return (
      typeof o.title === 'string' &&
      typeof o.url === 'string' &&
      typeof o.snippet === 'string'
    )
  })
}

/** Lê resultados cacheados. `null` em miss/erro/Redis-nulo (fail-open). */
export async function readTavilyCache(
  redis: RedisLike | null,
  key: string,
): Promise<TavilyCacheItem[] | null> {
  if (!redis) return null
  try {
    const raw = await redis.get(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isItems(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Grava resultados (best-effort, TTL 1h). Não grava lista vazia. */
export async function writeTavilyCache(
  redis: RedisLike | null,
  key: string,
  items: TavilyCacheItem[],
): Promise<void> {
  if (!redis || items.length === 0) return
  try {
    await redis.set(key, JSON.stringify(items), 'EX', CACHE_TTL_SECONDS)
  } catch {
    // cache é best-effort — nunca propaga.
  }
}
