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

/** Cria o model de embedding (proxy LiteLLM quando configurado, senão direto). */
async function getEmbeddingModel(scope: EmbeddingScope) {
  const apiKey = await resolveOpenAIKey(scope)
  const litellm = litellmConfig()
  const openai = createOpenAI(
    litellm
      ? { apiKey: apiKey || litellm.key, baseURL: `${litellm.url}/v1` }
      : { apiKey },
  )
  return openai.textEmbeddingModel(EMBEDDING_MODEL)
}

/** Embeda um único texto (query do retrieval). */
export async function embedQuery(
  text: string,
  scope: EmbeddingScope,
): Promise<number[]> {
  const model = await getEmbeddingModel(scope)
  const { embedding } = await embed({ model, value: text })
  return embedding
}

/**
 * Embeda um lote de textos (chunks na ingestão). A OpenAI aceita lotes grandes,
 * mas fatiamos em 96 para evitar payloads gigantes / timeouts.
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
    const { embeddings } = await embedMany({ model, values: slice })
    out.push(...embeddings)
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
