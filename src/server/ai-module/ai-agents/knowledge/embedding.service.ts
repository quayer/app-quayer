/**
 * Embedding service — vetores para RAG.
 *
 * Modelo fixo: OpenAI `text-embedding-3-small` (1536 dims) — barato, rápido e
 * bom o suficiente. A coluna knowledge_chunks.embedding é vector(1536); trocar de
 * modelo exige re-embeddar tudo, então isto é o contrato.
 *
 * BYOK: resolve a key OpenAI por org (credentialResolver 'AI' + 'openai'),
 * caindo para a env. Quando LiteLLM está ativo (LITELLM_URL+MASTER_KEY), as
 * embeddings também passam pelo proxy (/v1/embeddings) — mesma observabilidade/
 * custo central do resto do LLM.
 *
 * Usado na ingestão (lote de chunks) e no retrieval (1 query por turno).
 */

import { createOpenAI } from '@ai-sdk/openai'
import { embed, embedMany } from 'ai'

import { credentialResolver } from '@/lib/providers/credential-resolver.service'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

export interface EmbeddingScope {
  organizationId: string
}

function litellmConfig(): { url: string; key: string } | null {
  const url = process.env.LITELLM_URL
  const key = process.env.LITELLM_MASTER_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/$/, ''), key }
}

/** Resolve a key OpenAI da org (BYOK) → env fallback. */
async function resolveOpenAIKey(scope: EmbeddingScope): Promise<string | undefined> {
  try {
    const cred = await credentialResolver.resolve('AI', 'openai', {
      organizationId: scope.organizationId,
    })
    if (cred?.credentials?.apiKey) return cred.credentials.apiKey
  } catch (err) {
    console.warn('[Embedding] BYOK resolve failed, falling back to env:', err)
  }
  return process.env.OPENAI_API_KEY
}

/** Erro claro quando a org não tem como gerar embeddings (sem key OpenAI). */
export class EmbeddingUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmbeddingUnavailableError'
  }
}

/** Cria o model de embedding (proxy LiteLLM quando configurado, senão direto). */
async function getEmbeddingModel(scope: EmbeddingScope) {
  const apiKey = await resolveOpenAIKey(scope)
  const litellm = litellmConfig()
  // Embeddings exigem OpenAI (text-embedding-3-small). Org só-Anthropic sem
  // OPENAI_API_KEY e sem LiteLLM → falha CLARA (não silenciosa). Ver SECRETS.md.
  if (!apiKey && !litellm) {
    throw new EmbeddingUnavailableError(
      'RAG indisponível: nenhuma credencial OpenAI para embeddings (configure OPENAI_API_KEY na org ou LiteLLM).',
    )
  }
  const openai = createOpenAI(
    litellm
      ? { apiKey: apiKey || litellm.key, baseURL: `${litellm.url}/v1` }
      : { apiKey },
  )
  return openai.textEmbeddingModel(EMBEDDING_MODEL)
}

const EMBED_TIMEOUT_MS = 12_000

/** Promise.race com timeout — embedding lento não pode travar o turno do agente. */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout após ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Retry com backoff exponencial p/ falhas transitórias (429/5xx/network). */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < tries - 1) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt))
      }
    }
  }
  throw lastErr
}

/** Embeda um único texto (query do retrieval). Com timeout — caminho quente. */
export async function embedQuery(
  text: string,
  scope: EmbeddingScope,
): Promise<number[]> {
  const model = await getEmbeddingModel(scope)
  const { embedding } = await withTimeout(
    embed({ model, value: text }),
    EMBED_TIMEOUT_MS,
    'embedQuery',
  )
  return embedding
}

/**
 * Embeda um lote de textos (chunks na ingestão). A OpenAI aceita lotes grandes,
 * mas fatiamos em 96 para evitar payloads gigantes / timeouts. Cada batch tem
 * retry (falha transitória) e VALIDA que o nº de vetores == nº de textos — se a
 * API devolver menos, lançamos (evita embeddings[i] undefined → vetor inválido).
 */
export async function embedTexts(
  texts: string[],
  scope: EmbeddingScope,
): Promise<number[][]> {
  if (texts.length === 0) return []
  const model = await getEmbeddingModel(scope)

  const BATCH = 96
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH)
    const { embeddings } = await withRetry(() =>
      withTimeout(embedMany({ model, values: slice }), EMBED_TIMEOUT_MS, 'embedMany'),
    )
    if (embeddings.length !== slice.length) {
      throw new Error(
        `Embedding count mismatch no batch ${i / BATCH}: ${embeddings.length} != ${slice.length}`,
      )
    }
    out.push(...embeddings)
  }
  if (out.length !== texts.length) {
    throw new Error(`Embedding total mismatch: ${out.length} != ${texts.length}`)
  }
  return out
}

/**
 * Serializa um vetor para o literal pgvector (`[0.1,0.2,...]`). Usado nos raw
 * queries (`'${toVectorLiteral(v)}'::vector`). Validamos que é finito para não
 * injetar lixo no SQL.
 */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`
}
