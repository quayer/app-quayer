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
import { getServerConfig } from '@/server/services/server-config'
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
  // Defaults vêm do server-config (env-overridable: RAG_TOP_K/RAG_THRESHOLD/
  // RAG_OVER_FETCH) — permite tunar recall/latência sem deploy. Override explícito
  // por chamada continua tendo precedência.
  const cfg = getServerConfig()
  const {
    collectionId,
    query,
    organizationId,
    topK = cfg.RAG_TOP_K,
    threshold = cfg.RAG_THRESHOLD,
    overFetch = cfg.RAG_OVER_FETCH,
  } = params

  const trimmed = query?.trim()
  if (!collectionId || !trimmed) return []

  try {
    const embedding = await embedQuery(trimmed, { organizationId })
    const vec = toVectorLiteral(embedding)
    const limit = Math.max(topK, overFetch)

    // JOIN com knowledge_collections + filtro organizationId = defesa multi-tenant:
    // mesmo que um ragCollectionId aponte (por bug) p/ coleção de outra org, o
    // filtro garante que só chunks da org chamadora voltam.
    const rows = await database.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        c."id",
        c."content",
        c."metadata",
        1 - (c."embedding" <=> ${vec}::vector) AS score
      FROM "knowledge_chunks" c
      JOIN "knowledge_collections" col ON col."id" = c."collectionId"
      WHERE c."collectionId" = ${collectionId}
        AND col."organizationId" = ${organizationId}
        AND c."embedding" IS NOT NULL
      ORDER BY c."embedding" <=> ${vec}::vector
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
    // Só a mensagem (não o objeto) — evita vazar baseURL/stack do LiteLLM nos logs.
    console.warn(
      '[KnowledgeRetrieval] busca falhou (ignorada):',
      err instanceof Error ? err.message : String(err),
    )
    return []
  }
}

/**
 * Limite de caracteres do bloco RAG injetado no system prompt (~1.5k tokens).
 * Bound necessário: sem ele um topK alto com chunks grandes infla o systemPrompt
 * e pode estourar o token budget do turno (que é calculado depois da injeção).
 */
const MAX_CONTEXT_CHARS = 6000

/**
 * Monta o bloco de contexto para injetar no system prompt. Numera as fontes e
 * respeita MAX_CONTEXT_CHARS (corta fontes excedentes). Retorna '' se vazio.
 */
export function buildContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return ''

  const picked: string[] = []
  let used = 0
  for (let i = 0; i < chunks.length; i++) {
    const entry = `[${i + 1}] ${chunks[i].content.trim()}`
    if (used + entry.length > MAX_CONTEXT_CHARS && picked.length > 0) break
    picked.push(entry)
    used += entry.length + 2
  }
  const sources = picked.join('\n\n')

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
