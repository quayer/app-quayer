/**
 * Unit tests do `runSourceEnrich` (source-enrich.job.ts) focados nos DOIS bugs
 * E2E do pipeline de fontes:
 *
 *   1. CROSS-BATCH MERGE — um 2º job (link colado em OUTRA mensagem) deve
 *      MERGEAR a proposta sobre a já persistida com a MESMA semântica intra-job
 *      (escalares: existente não-vazio vence; listas: dedupe union), nunca
 *      sobrescrever escalares nem substituir arrays wholesale.
 *   2. REOPEN PÓS-ACEITE — proposta NÃO-VAZIA chegando com
 *      `confirmations.source === true` flipa o sentinel para false NO MESMO
 *      patch atômico (o card source_progress ressurge para revisão). Batch
 *      vazio/ungrounded NUNCA reabre nem clobbera a proposta existente.
 *
 * Estratégia (espelha image-pipeline.test.ts): mocka os seams de IO —
 * ingestSource (RAG), runLLMSubAgent (síntese), image-pipeline e o Prisma
 * (store de builderState em memória cujo $transaction repassa o MESMO store ao
 * tx) — e deixa o caminho real source-enrich.job → patchSourceIngestionAtomic
 * → mergeProposal/patchBuilderState rodar de verdade. SEM rede, SEM DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (hoisted ANTES de qualquer import que os toque)
// ---------------------------------------------------------------------------

/** Shape mínimo do IngestResult que o job consome (status/extractedText/...). */
interface IngestResultLike {
  sourceId: string
  status: 'ready' | 'error'
  chunkCount: number
  error?: string
  extractedText?: string
  extractedHtml?: string
}

type LLMResult =
  | { success: true; data: { text: string } }
  | { success: false; error: string }

// Texto longo o suficiente para passar o gate SOURCE_TEXT_MIN_CHARS (80).
const EXTRACTED_TEXT =
  'Vibra Residencial: apartamentos de 2 quartos no Butantã, lazer completo com piscina e coworking, a minutos da estação. Unidades a partir de R$ 333.333.'

const mockIngestSource = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<IngestResultLike>>(async () => ({
    sourceId: 'src-1',
    status: 'ready',
    chunkCount: 3,
    extractedText: EXTRACTED_TEXT,
    // sem extractedHtml → caminho de imagens fica gateado (irrelevante aqui)
  })),
)

vi.mock('@/server/ai-module/ai-agents/knowledge/knowledge-ingestion.service', () => ({
  ingestSource: mockIngestSource,
}))

const mockRunLLMSubAgent = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<LLMResult>>(),
)

vi.mock('../sub-agents/base', () => ({
  runLLMSubAgent: mockRunLLMSubAgent,
}))

vi.mock('./image-pipeline', () => ({
  extractImagesForSource: vi.fn(async () => ({ persisted: 0 })),
}))

// In-memory builderState: o $transaction entrega um tx apontando para o MESMO
// store, então patchSourceIngestionAtomic roda o merge REAL contra ele.
const store = vi.hoisted(() => ({ builderState: null as unknown }))

const mockConvFindFirst = vi.hoisted(() =>
  vi.fn(async () => ({ builderState: store.builderState })),
)
const mockConvUpdateMany = vi.hoisted(() =>
  vi.fn(
    async (args: { data: { builderState: unknown } }): Promise<{ count: number }> => {
      store.builderState = args.data.builderState
      return { count: 1 }
    },
  ),
)
const mockSourceFindFirst = vi.hoisted(() =>
  vi.fn(async () => ({
    source: 'https://vibraresidencial.com.br',
    collectionId: 'col-1',
    type: 'url',
    imagesEnabled: false,
  })),
)

vi.mock('@/server/services/database', () => {
  const conversationDelegate = {
    findFirst: mockConvFindFirst,
    updateMany: mockConvUpdateMany,
  }
  return {
    database: {
      knowledgeSource: { findFirst: mockSourceFindFirst },
      builderProjectConversation: conversationDelegate,
      $transaction: vi.fn(
        async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
          fn({ builderProjectConversation: conversationDelegate }),
      ),
    },
  }
})

// ---------------------------------------------------------------------------
// SUT (importado APÓS os mocks)
// ---------------------------------------------------------------------------

import { runSourceEnrich } from './source-enrich.job'
import { parseBuilderState } from '../cards/builder-state'
import type { SourceEnrichJobPayload } from '@/server/services/jobs/source-enrich.queue'

const PAYLOAD: SourceEnrichJobPayload = {
  organizationId: 'org-1',
  userId: 'user-1',
  projectId: 'proj-1',
  conversationId: 'conv-1',
  sourceIds: ['src-1'],
}

/** JSON de síntese válido (shape do source-synthesis.prompt). */
function synthesisJSON(fields: Record<string, unknown>): string {
  return JSON.stringify({
    businessName: null,
    services: [],
    audience: null,
    differentiators: [],
    tone: null,
    address: null,
    description: null,
    ...fields,
  })
}

function finalState() {
  return parseBuilderState(store.builderState)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIngestSource.mockResolvedValue({
    sourceId: 'src-1',
    status: 'ready',
    chunkCount: 3,
    extractedText: EXTRACTED_TEXT,
  })
  mockSourceFindFirst.mockResolvedValue({
    source: 'https://vibraresidencial.com.br',
    collectionId: 'col-1',
    type: 'url',
    imagesEnabled: false,
  })
})

describe('runSourceEnrich — cross-batch proposal merge', () => {
  it('merges a 2nd-batch proposal onto the persisted one (scalars first-wins, lists union)', async () => {
    store.builderState = {
      sourceIngestion: {
        sources: [
          {
            value: 'https://vibrabutanta.com.br',
            type: 'url',
            status: 'ready',
            sourceId: 'src-0',
          },
          {
            value: 'https://vibraresidencial.com.br',
            type: 'url',
            status: 'pending',
            sourceId: 'src-1',
          },
        ],
        proposed: {
          businessName: 'Vibra Butantã',
          services: ['Apartamentos de 2 quartos'],
        },
      },
      confirmations: { source: false },
    }

    mockRunLLMSubAgent.mockResolvedValue({
      success: true,
      data: {
        text: synthesisJSON({
          businessName: 'Vibra Residencial',
          services: ['Apartamentos de 2 quartos', 'Coworking'],
          audience: 'investidores',
        }),
      },
    })

    const result = await runSourceEnrich(PAYLOAD)
    expect(result).toEqual({
      processed: 1,
      ingested: 1,
      errors: 0,
      proposalWritten: true,
    })

    const state = finalState()
    // Escalar existente NÃO-vazio vence (nada de overwrite silencioso).
    expect(state.sourceIngestion.proposed?.businessName).toBe('Vibra Butantã')
    // Escalar ainda vazio é preenchido pelo novo batch.
    expect(state.sourceIngestion.proposed?.audience).toBe('investidores')
    // Lista: dedupe union (não substituição wholesale).
    expect(state.sourceIngestion.proposed?.services).toEqual([
      'Apartamentos de 2 quartos',
      'Coworking',
    ])
    // Espelho de status/imagens settla para a fonte do batch.
    const mirror = state.sourceIngestion.sources.find(
      (s) => s.sourceId === 'src-1',
    )
    expect(mirror?.status).toBe('ready')
    expect(mirror?.imagesStatus).toBe('ready')
    // Sem aceite anterior, o sentinel não muda.
    expect(state.confirmations.source).toBe(false)
  })
})

describe('runSourceEnrich — reopen pós-aceite (confirmations.source)', () => {
  it('flips confirmations.source back to false when a grounded proposal lands after an accept', async () => {
    store.builderState = {
      sourceIngestion: {
        sources: [
          {
            value: 'https://vibraresidencial.com.br',
            type: 'url',
            status: 'pending',
            sourceId: 'src-1',
          },
        ],
        proposed: { businessName: 'Vibra Butantã' },
      },
      confirmations: { source: true, persona: true },
    }

    mockRunLLMSubAgent.mockResolvedValue({
      success: true,
      data: {
        text: synthesisJSON({
          businessName: 'Vibra Residencial',
          differentiators: ['Piscina', 'Coworking'],
        }),
      },
    })

    const result = await runSourceEnrich(PAYLOAD)
    expect(result.proposalWritten).toBe(true)

    const state = finalState()
    // O card ressurge: sentinel reaberto NO MESMO patch atômico…
    expect(state.confirmations.source).toBe(false)
    // …sem tocar nenhuma outra confirmação.
    expect(state.confirmations.persona).toBe(true)
    // E a proposta nova foi MERGEADA (first-wins), não sobrescrita.
    expect(state.sourceIngestion.proposed?.businessName).toBe('Vibra Butantã')
    expect(state.sourceIngestion.proposed?.differentiators).toEqual([
      'Piscina',
      'Coworking',
    ])
  })

  it('does NOT reopen nor clobber the proposal on an ungrounded batch', async () => {
    store.builderState = {
      sourceIngestion: {
        sources: [
          {
            value: 'https://vibraresidencial.com.br',
            type: 'url',
            status: 'pending',
            sourceId: 'src-1',
          },
        ],
        proposed: { businessName: 'Vibra Butantã' },
      },
      confirmations: { source: true },
    }

    // Síntese válida porém 100% vazia (ungrounded é resposta VÁLIDA).
    mockRunLLMSubAgent.mockResolvedValue({
      success: true,
      data: { text: synthesisJSON({}) },
    })

    const result = await runSourceEnrich(PAYLOAD)
    expect(result.proposalWritten).toBe(false)

    const state = finalState()
    // Aceite preservado: nada para revisar, o card NÃO ressurge.
    expect(state.confirmations.source).toBe(true)
    // Proposta existente intocada (guard de escrita vazia).
    expect(state.sourceIngestion.proposed?.businessName).toBe('Vibra Butantã')
    // O espelho de status ainda settla normalmente.
    const mirror = state.sourceIngestion.sources.find(
      (s) => s.sourceId === 'src-1',
    )
    expect(mirror?.status).toBe('ready')
  })

  it('does NOT reopen when synthesis fails (graceful degradation path)', async () => {
    store.builderState = {
      sourceIngestion: {
        sources: [
          {
            value: 'https://vibraresidencial.com.br',
            type: 'url',
            status: 'pending',
            sourceId: 'src-1',
          },
        ],
        proposed: { businessName: 'Vibra Butantã' },
      },
      confirmations: { source: true },
    }

    mockRunLLMSubAgent.mockResolvedValue({
      success: false,
      error: 'timeout',
    })

    const result = await runSourceEnrich(PAYLOAD)
    expect(result).toEqual({
      processed: 1,
      ingested: 1,
      errors: 0,
      proposalWritten: false,
    })

    const state = finalState()
    expect(state.confirmations.source).toBe(true)
    expect(state.sourceIngestion.proposed?.businessName).toBe('Vibra Butantã')
  })
})
