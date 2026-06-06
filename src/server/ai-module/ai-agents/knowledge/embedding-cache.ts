/**
 * Cache Redis de embedding de QUERY (caminho quente do RAG).
 *
 * Por quê: `embedQuery` re-embeda a query a cada turno chamando a API paga da
 * OpenAI. Em atendimento WhatsApp as perguntas repetem MUITO entre centenas de
 * leads ("tem foto?", "qual o horário?", "tem estacionamento?"), então um cache
 * key-by-(model + sha256(text)) corta custo de API e latência no caminho quente.
 *
 * Org-agnóstico DE PROPÓSITO: o vetor de `text-embedding-3-small` é determinístico
 * por (modelo, texto) — não depende de qual key/org pagou a chamada. Cachear por
 * org só fragmentaria o hit-rate. A key é sha256(texto) (não o texto cru) e o
 * valor é só o vetor — que qualquer org poderia recomputar — então não há vazamento.
 *
 * O modelo entra na key para o cache não "envenenar" se um dia trocarmos de modelo
 * de embedding (a coluna é vector(1536), mas isto é defesa em profundidade).
 *
 * Fail-open SEMPRE: Redis ausente/erro nunca pode derrubar o turno do agente —
 * miss silencioso → embeda normalmente. Espelha o cache do enrich_instagram.
 */

import type Redis from 'ioredis'

import { hash } from '@/lib/crypto'

/** Client mínimo necessário — facilita injeção/mocks no teste. */
type RedisLike = Pick<Redis, 'get' | 'set'>

const CACHE_TTL_SECONDS = 24 * 60 * 60
const CACHE_PREFIX = 'embed'

/** `embed:<model>:<sha256(text)>` — model na key é proposital (ver header). */
export function embeddingCacheKey(model: string, text: string): string {
  return `${CACHE_PREFIX}:${model}:${hash(text)}`
}

/** Valida que o JSON guardado é mesmo um vetor de números (não lixo/forma errada). */
function isVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/** Lê o vetor cacheado. `null` em miss, Redis ausente ou qualquer erro (fail-open). */
export async function readEmbeddingCache(
  redis: RedisLike | null,
  model: string,
  text: string,
): Promise<number[] | null> {
  if (!redis || !text) return null
  try {
    const raw = await redis.get(embeddingCacheKey(model, text))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isVector(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Grava o vetor (best-effort, TTL 24h). Silencioso em erro — cache é opcional. */
export async function writeEmbeddingCache(
  redis: RedisLike | null,
  model: string,
  text: string,
  vector: number[],
): Promise<void> {
  if (!redis || !text || vector.length === 0) return
  try {
    await redis.set(
      embeddingCacheKey(model, text),
      JSON.stringify(vector),
      'EX',
      CACHE_TTL_SECONDS,
    )
  } catch {
    // cache é best-effort — nunca propaga.
  }
}
