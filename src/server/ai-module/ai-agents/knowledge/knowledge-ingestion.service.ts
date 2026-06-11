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
 *
 * O texto cru extraído é devolvido em `IngestResult.extractedText` (caminho de
 * sucesso) para que o job `quayer:source-enrich` do Builder sintetize campos
 * propostos a partir do MESMO fetch — sem re-baixar a URL/IG nem reexecutar o
 * fetcher com guarda SSRF. Não é persistido; vive só no retorno.
 */

import crypto from 'crypto'
import { Prisma } from '@prisma/client'

import { database } from '@/server/services/database'
import { chunkText } from './chunking'
import { embedTexts, toVectorLiteral } from './embedding.service'
import { extractText, extractUrlTextWithHtml } from './text-extraction'

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
  /**
   * Raw text extracted from the source BEFORE chunking. Populated on the success
   * path so downstream consumers (the Builder `quayer:source-enrich` job) can
   * synthesize proposed fields from the same fetch — no second network round-trip,
   * no re-running the SSRF-guarded fetcher. Undefined when extraction produced no
   * text or the ingestion errored. Not persisted; lives only in the return value.
   */
  extractedText?: string
  /**
   * Raw HTML for image extraction (Onda D). Populated only for `type='url'`
   * success (and only when the URL served HTML, not a PDF) so the Builder
   * `quayer:source-enrich` job can extract `<img>`/`url()` refs from the SAME
   * fetch — no second network round-trip, no re-entry into the SSRF guard.
   * Undefined for pdf/text sources and on error. Not persisted; return-only.
   */
  extractedHtml?: string
}

interface SourceRow {
  id: string
  collectionId: string
  organizationId: string
  type: string
  source: string
}

/**
 * Resultado do FETCH (1ª etapa da ingestão, isolada). Carrega a `source` já
 * resolvida + org-validada (para a etapa de embed/persist não reconsultar) e o
 * texto/HTML crus do MESMO fetch. Usado pelo Builder source-enrich.job para
 * rodar embed+persist EM PARALELO com a síntese/imagens (todas consomem este
 * mesmo texto) — sem 2º round-trip nem reentrada no guard SSRF.
 */
export interface FetchSourceResult {
  source: SourceRow
  /** Texto limpo extraído (pode ser ''; o gate de chunks trata vazio). */
  text: string
  /** HTML cru do MESMO fetch (só `type='url'` servindo HTML; '' caso contrário). */
  extractedHtml: string
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
 * Marca status=error na fonte (best-effort). Compartilhado pelas duas etapas
 * (fetch e embed/persist) extraídas de `ingestSource`. Se ESTE write falhar a
 * fonte fica presa em "pending" para sempre na UI ("fonte eternamente na fila")
 * — loga alto, nunca silencia.
 */
async function markSourceError(
  delegate: NonNullable<ReturnType<typeof sourceDelegate>>,
  sourceId: string,
  message: string,
): Promise<void> {
  await delegate
    .update({
      where: { id: sourceId },
      data: { status: 'error', error: message.slice(0, 1000), updatedAt: new Date() },
    })
    .catch((statusErr: unknown) => {
      console.error(
        '[KnowledgeIngestion] falha ao gravar status=error (fonte ficará pending!)',
        sourceId,
        statusErr instanceof Error ? statusErr.message : String(statusErr),
      )
    })
}

/**
 * ETAPA 1 — FETCH. Resolve+org-valida a fonte, marca `processing` e extrai o
 * texto/HTML crus (1 round-trip; SSRF-guarded em `safeFetch`). Devolve a `source`
 * resolvida para a etapa de embed/persist não reconsultar. SÓ lança quando a
 * fonte/tabela não existe ou é de outra org (mesmos casos que `ingestSource`);
 * uma falha de fetch é marcada `status=error` na fonte E relançada para o caller
 * registrar o resultado de erro (espelha o try/catch original).
 *
 * Isolada de `ingestSource` para o Builder source-enrich.job poder rodar a etapa
 * 2 (embed/persist) EM PARALELO com a síntese/imagens — todas consomem o `text`
 * deste fetch, nenhuma depende da saída da outra.
 */
export async function fetchSource(
  sourceId: string,
  opts: IngestOptions = {},
): Promise<FetchSourceResult> {
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
    // Onda D — para fontes do tipo 'url' capturamos o HTML cru do MESMO fetch
    // (sem 2º round-trip nem reentrada no guard SSRF) para o image-pipeline.
    // pdf/text não têm HTML → `extractedHtml` fica ''.
    if (source.type === 'url') {
      const extracted = await extractUrlTextWithHtml(source.source)
      return { source, text: extracted.text, extractedHtml: extracted.html }
    }
    const text = await extractText(source, opts)
    return { source, text, extractedHtml: '' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[KnowledgeIngestion] falha no fetch', sourceId, message)
    await markSourceError(delegate, sourceId, message)
    throw err
  }
}

/**
 * ETAPA 2 — EMBED + PERSIST. Chunkifica o `text` já extraído (etapa 1), embeda em
 * lote e persiste no pgvector, marcando `ready` (ou `error` quando não há texto).
 * Idempotente por fonte (apaga chunks antigos antes de inserir). Fail-safe: marca
 * a fonte `error` e devolve o resultado de erro em vez de lançar.
 */
export async function embedAndPersistSource(
  source: SourceRow,
  text: string,
  opts: Pick<IngestOptions, 'chunkSize' | 'chunkOverlap'> = {},
): Promise<IngestResult> {
  const delegate = sourceDelegate()
  if (!delegate) throw new Error('knowledge_sources indisponível (migration não aplicada?)')

  try {
    const chunks = chunkText(text, { size: opts.chunkSize, overlap: opts.chunkOverlap })

    if (chunks.length === 0) {
      await delegate.update({
        where: { id: source.id },
        data: { status: 'error', error: 'Nenhum texto extraível', chunkCount: 0, updatedAt: new Date() },
      })
      return { sourceId: source.id, status: 'error', chunkCount: 0, error: 'sem texto' }
    }

    const embeddings = await embedTexts(
      chunks.map((c) => c.content),
      { organizationId: source.organizationId },
    )
    await persistChunks(source, chunks, embeddings)

    await delegate.update({
      where: { id: source.id },
      data: { status: 'ready', chunkCount: chunks.length, error: null, updatedAt: new Date() },
    })
    return { sourceId: source.id, status: 'ready', chunkCount: chunks.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[KnowledgeIngestion] falha ao embedar/persistir', source.id, message)
    await markSourceError(delegate, source.id, message)
    return { sourceId: source.id, status: 'error', chunkCount: 0, error: message }
  }
}

/**
 * Executa a ingestão completa de uma fonte: FETCH (etapa 1) → EMBED+PERSIST
 * (etapa 2), composta das funções isoladas acima para os outros callers (upload
 * de PDF, knowledge-source routes) seguirem com a MESMA semântica de antes.
 * Marca processing → ready|error e persiste o erro na própria fonte. Só lança se
 * a fonte/tabela não existir.
 *
 * O Builder `quayer:source-enrich` job NÃO usa esta composição — ele chama
 * `fetchSource` + `embedAndPersistSource` diretamente para paralelizar a etapa 2
 * com a síntese/imagens.
 */
export async function ingestSource(
  sourceId: string,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  // ETAPA 1 — fetch. Falha de fetch já marca status=error na fonte; aqui só
  // convertemos o throw no MESMO resultado de erro que o caller espera.
  let fetched: FetchSourceResult
  try {
    fetched = await fetchSource(sourceId, opts)
  } catch (err) {
    // `fetchSource` relança apenas: (a) fonte/tabela ausente ou cross-org (que
    // SEMPRE devem lançar, como antes), ou (b) falha de fetch (já persistida como
    // status=error). Distinguimos: se a fonte existe e foi marcada error, devolve
    // o resultado de erro; senão, propaga (fonte inexistente / cross-org).
    const message = err instanceof Error ? err.message : String(err)
    if (
      message.includes('não encontrada') ||
      message.includes('outra organização') ||
      message.includes('indisponível')
    ) {
      throw err
    }
    return { sourceId, status: 'error', chunkCount: 0, error: message }
  }

  // ETAPA 2 — embed + persist. Onda D: propaga o HTML cru do mesmo fetch.
  const result = await embedAndPersistSource(fetched.source, fetched.text, {
    chunkSize: opts.chunkSize,
    chunkOverlap: opts.chunkOverlap,
  })
  if (result.status === 'error') return result
  return {
    ...result,
    extractedText: fetched.text,
    extractedHtml: fetched.extractedHtml.length > 0 ? fetched.extractedHtml : undefined,
  }
}
