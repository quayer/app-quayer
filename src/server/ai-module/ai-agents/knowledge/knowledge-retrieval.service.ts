/**
 * Knowledge retrieval — busca semântica no pgvector.
 *
 * Embeda a query do turno e faz KNN por cosseno (`<=>`) na coleção do agente.
 * O vetor NUNCA passa pelo Prisma tipado: usamos $queryRaw com o literal
 * pgvector castado (`$1::vector`). O índice HNSW (vector_cosine_ops) é usado
 * automaticamente pelo ORDER BY embedding <=> query.
 *
 * Decisão (Wave RAG): retrieval por INJEÇÃO automática no system prompt
 * (em prepareAgentCall), NÃO como tool — economiza um passo do tool-loop e
 * garante que o conhecimento esteja sempre disponível.
 *
 * Defensivo: qualquer falha (coleção vazia, extensão ausente, embedding falhou)
 * retorna [] — RAG nunca pode derrubar o agente.
 */

import { Prisma } from '@prisma/client'

import { database } from '@/server/services/database'
import { embedQuery, toVectorLiteral } from './embedding.service'

export interface RetrievedChunk {
  id: string
  content: string
  score: number
  metadata: Record<string, unknown> | null
}

export interface RetrieveParams {
  collectionId: string
  query: string
  organizationId: string
  /** Quantos chunks retornar no fim (após filtro de threshold). */
  topK?: number
  /** Score mínimo de cosseno (0..1) para um chunk ser considerado relevante. */
  threshold?: number
  /** Quantos buscar antes do filtro (over-fetch melhora recall). */
  overFetch?: number
}

const DEFAULT_TOP_K = 5
const DEFAULT_THRESHOLD = 0.75
const DEFAULT_OVER_FETCH = 12

interface RawRow {
  id: string
  content: string
  score: number
  metadata: unknown
}

/**
 * Retorna os chunks mais relevantes para a query, já filtrados por threshold e
 * limitados a topK. Lista vazia em qualquer erro (log defensivo).
 */
export async function retrieveRelevantChunks(
  params: RetrieveParams,
): Promise<RetrievedChunk[]> {
  const {
    collectionId,
    query,
    organizationId,
    topK = DEFAULT_TOP_K,
    threshold = DEFAULT_THRESHOLD,
    overFetch = DEFAULT_OVER_FETCH,
  } = params

  const trimmed = query?.trim()
  if (!collectionId || !trimmed) return []

  try {
    const embedding = await embedQuery(trimmed, { organizationId })
    const vec = toVectorLiteral(embedding)
    const limit = Math.max(topK, overFetch)

    const rows = await database.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        "id",
        "content",
        "metadata",
        1 - ("embedding" <=> ${vec}::vector) AS score
      FROM "knowledge_chunks"
      WHERE "collectionId" = ${collectionId}
        AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${vec}::vector
      LIMIT ${limit}
    `)

    return rows
      .map((r) => ({
        id: r.id,
        content: r.content,
        score: typeof r.score === 'number' ? r.score : Number(r.score),
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      }))
      .filter((r) => Number.isFinite(r.score) && r.score >= threshold)
      .slice(0, topK)
  } catch (err) {
    console.warn('[KnowledgeRetrieval] busca falhou (ignorada):', err)
    return []
  }
}

/**
 * Monta o bloco de contexto para injetar no system prompt. Numera as fontes e
 * inclui o score (debug). Retorna '' se não houver chunks (caller pula a injeção).
 */
export function buildContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return ''

  const sources = chunks
    .map((c, i) => `[${i + 1}] ${c.content.trim()}`)
    .join('\n\n')

  return [
    '## Base de conhecimento',
    'Use as informações abaixo (recuperadas da base de conhecimento da empresa)',
    'para responder quando forem relevantes. Se a resposta não estiver aqui e você',
    'não souber, diga que vai verificar — não invente.',
    '',
    sources,
  ].join('\n')
}

/**
 * Atalho usado pelo runtime: retrieve + monta bloco. Retorna '' se nada relevante.
 */
export async function retrieveContextBlock(
  params: RetrieveParams,
): Promise<string> {
  const chunks = await retrieveRelevantChunks(params)
  return buildContextBlock(chunks)
}
