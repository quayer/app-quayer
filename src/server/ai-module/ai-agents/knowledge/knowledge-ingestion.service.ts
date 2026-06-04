/**
 * Knowledge ingestion — transforma uma fonte (PDF/URL/texto) em chunks vetorizados.
 *
 * Pipeline: extrair texto (text-extraction.ts) → chunkText → embedTexts (OpenAI)
 * → INSERT raw no pgvector. Idempotente por fonte: re-ingerir apaga os chunks
 * antigos da fonte antes de inserir os novos.
 *
 * O vetor é inserido via $executeRaw com cast `::vector` (Prisma não tipa vector).
 * Status da fonte: pending → processing → ready | error. Erros são persistidos em
 * knowledge_sources.error (nunca lança pra cima sem antes marcar a fonte).
 *
 * v1: ingestão SÍNCRONA (chamada pela rota). Migrar para job BullMQ quando
 * coleções ficarem grandes (ver docs/backlog).
 */

import crypto from 'crypto'
import { Prisma } from '@prisma/client'

import { database } from '@/server/services/database'
import { chunkText } from './chunking'
import { embedTexts, toVectorLiteral } from './embedding.service'
import { extractText } from './text-extraction'

export interface IngestOptions {
  /** Buffer do PDF (quando type='pdf' e a fonte veio de upload). */
  buffer?: Buffer
  /** Texto cru já extraído (quando type='text'). */
  rawText?: string
  chunkSize?: number
  chunkOverlap?: number
  /**
   * Org esperada do chamador. Quando passado, validamos que a fonte pertence a
   * ela ANTES de processar (defesa multi-tenant). As rotas/handler sempre passam
   * a org autenticada. Se um dia esta função for chamada de input não-confiável,
   * este parâmetro evita ingestão cross-org.
   */
  expectedOrganizationId?: string
}

export interface IngestResult {
  sourceId: string
  status: 'ready' | 'error'
  chunkCount: number
  error?: string
}

interface SourceRow {
  id: string
  collectionId: string
  organizationId: string
  type: string
  source: string
}

function sourceDelegate() {
  const d = (database as unknown as Record<string, unknown>)['knowledgeSource'] as
    | {
        findUnique: (args: unknown) => Promise<SourceRow | null>
        update: (args: unknown) => Promise<unknown>
      }
    | undefined
  if (!d || typeof d.findUnique !== 'function') return null
  return d
}

/** Insere os chunks vetorizados de forma atômica (apaga antigos da fonte antes). */
async function persistChunks(
  source: SourceRow,
  chunks: { content: string; ordinal: number }[],
  embeddings: number[][],
): Promise<void> {
  await database.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`DELETE FROM "knowledge_chunks" WHERE "sourceId" = ${source.id}`,
    )
    for (let i = 0; i < chunks.length; i++) {
      const id = crypto.randomUUID()
      const vec = toVectorLiteral(embeddings[i])
      const meta = JSON.stringify({
        sourceType: source.type,
        source: source.source,
        ordinal: chunks[i].ordinal,
      })
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "knowledge_chunks"
          ("id","collectionId","sourceId","content","embedding","metadata","ordinal","createdAt")
        VALUES
          (${id}, ${source.collectionId}, ${source.id}, ${chunks[i].content},
           ${vec}::vector, ${meta}::jsonb, ${chunks[i].ordinal}, NOW())
      `)
    }
  })
}

/**
 * Executa a ingestão completa de uma fonte. Marca processing → ready|error e
 * persiste o erro na própria fonte. Só lança se a fonte/tabela não existir.
 */
export async function ingestSource(
  sourceId: string,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const delegate = sourceDelegate()
  if (!delegate) throw new Error('knowledge_sources indisponível (migration não aplicada?)')

  const source = await delegate.findUnique({
    where: { id: sourceId },
    select: { id: true, collectionId: true, organizationId: true, type: true, source: true },
  })
  if (!source) throw new Error(`Fonte ${sourceId} não encontrada`)
  if (opts.expectedOrganizationId && source.organizationId !== opts.expectedOrganizationId) {
    throw new Error('Fonte de outra organização (acesso negado)')
  }

  await delegate.update({
    where: { id: sourceId },
    data: { status: 'processing', error: null, updatedAt: new Date() },
  })

  try {
    const text = await extractText(source, opts)
    const chunks = chunkText(text, { size: opts.chunkSize, overlap: opts.chunkOverlap })

    if (chunks.length === 0) {
      await delegate.update({
        where: { id: sourceId },
        data: { status: 'error', error: 'Nenhum texto extraível', chunkCount: 0, updatedAt: new Date() },
      })
      return { sourceId, status: 'error', chunkCount: 0, error: 'sem texto' }
    }

    const embeddings = await embedTexts(
      chunks.map((c) => c.content),
      { organizationId: source.organizationId },
    )
    await persistChunks(source, chunks, embeddings)

    await delegate.update({
      where: { id: sourceId },
      data: { status: 'ready', chunkCount: chunks.length, error: null, updatedAt: new Date() },
    })
    return { sourceId, status: 'ready', chunkCount: chunks.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[KnowledgeIngestion] falha ao ingerir', sourceId, message)
    await delegate
      .update({
        where: { id: sourceId },
        data: { status: 'error', error: message.slice(0, 1000), updatedAt: new Date() },
      })
      .catch(() => {})
    return { sourceId, status: 'error', chunkCount: 0, error: message }
  }
}
