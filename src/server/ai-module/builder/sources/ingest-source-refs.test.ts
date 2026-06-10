/**
 * Unit tests do `ingestSourceRefs` (create + seed + enqueue compartilhado)
 * focados no bug E2E de URL duplicada com/sem barra final:
 *
 *   - CANONICALIZAÇÃO: refs crus (POST body / teach_agent) são normalizados
 *     para UMA forma canônica (sem barra final, sem tracking params) ANTES de
 *     gravar a KnowledgeSource e de seedar o espelho builderState.
 *   - DEDUPE intra-call: "https://acme.com.br" + "https://acme.com.br/" no
 *     mesmo call viram UM ref / UMA row / UM seed.
 *   - REUSO de row: re-paste de um valor canônico que a collection já tem NÃO
 *     cria row duplicada — reseta a existente para pending (refresh) e o GET
 *     /sources/status não acumula entradas duplicadas.
 *   - MERGE do espelho: entrada legada com barra no builderState colapsa com o
 *     seed canônico novo (mergeSources deduplica por forma canônica).
 *
 * Seams mockados: Prisma (rows + builderState em memória), knowledge-helpers
 * (collection) e a fila BullMQ. O caminho ingest-source-refs →
 * patchSourceIngestionAtomic → mergeSources roda REAL. SEM rede, SEM DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (hoisted ANTES de qualquer import que os toque)
// ---------------------------------------------------------------------------

const mockEnsureCollection = vi.hoisted(() =>
  vi.fn(async (): Promise<string> => 'col-1'),
)

vi.mock('../knowledge/knowledge-helpers', () => ({
  ensureCollectionIdOrThrow: mockEnsureCollection,
}))

const mockEnqueue = vi.hoisted(() =>
  vi.fn(async (_payload: unknown): Promise<void> => undefined),
)

vi.mock('@/server/services/jobs/source-enrich.queue', () => ({
  enqueueSourceEnrich: mockEnqueue,
}))

/** Row em memória de KnowledgeSource (campos que o SUT toca). */
interface SourceRowLike {
  id: string
  collectionId: string
  organizationId: string
  type: string
  source: string
  status: string
  error: string | null
}

const store = vi.hoisted(() => ({
  rows: [] as {
    id: string
    collectionId: string
    organizationId: string
    type: string
    source: string
    status: string
    error: string | null
  }[],
  nextId: 1,
  builderState: null as unknown,
}))

const mockSourceFindFirst = vi.hoisted(() =>
  vi.fn(
    async (args: {
      where: {
        collectionId: string
        organizationId: string
        type: string
        source: string
      }
    }) =>
      store.rows.find(
        (r) =>
          r.collectionId === args.where.collectionId &&
          r.organizationId === args.where.organizationId &&
          r.type === args.where.type &&
          r.source === args.where.source,
      ) ?? null,
  ),
)

const mockSourceCreate = vi.hoisted(() =>
  vi.fn(
    async (args: {
      data: {
        collectionId: string
        organizationId: string
        type: string
        source: string
        status: string
      }
    }): Promise<{ id: string }> => {
      const id = `src-${store.nextId++}`
      store.rows.push({ id, error: null, ...args.data })
      return { id }
    },
  ),
)

const mockSourceUpdateMany = vi.hoisted(() =>
  vi.fn(
    async (args: {
      where: { id: string; organizationId: string }
      data: { status: string; error: null }
    }): Promise<{ count: number }> => {
      const row = store.rows.find(
        (r) =>
          r.id === args.where.id &&
          r.organizationId === args.where.organizationId,
      )
      if (!row) return { count: 0 }
      row.status = args.data.status
      row.error = args.data.error
      return { count: 1 }
    },
  ),
)

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

vi.mock('@/server/services/database', () => {
  const conversationDelegate = {
    findFirst: mockConvFindFirst,
    updateMany: mockConvUpdateMany,
  }
  return {
    database: {
      knowledgeSource: {
        findFirst: mockSourceFindFirst,
        create: mockSourceCreate,
        updateMany: mockSourceUpdateMany,
      },
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

import { ingestSourceRefs } from './ingest-source-refs'
import { parseBuilderState } from '../cards/builder-state'
import type { ProjectRow } from '../knowledge/knowledge-helpers'

const PROJECT: ProjectRow = { id: 'proj-1', aiAgentId: null, metadata: null }

const BASE_ARGS = {
  project: PROJECT,
  conversationId: 'conv-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as const

function seedRow(row: Partial<SourceRowLike> & { source: string }): void {
  store.rows.push({
    id: `src-${store.nextId++}`,
    collectionId: 'col-1',
    organizationId: 'org-1',
    type: 'url',
    status: 'ready',
    error: null,
    ...row,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  store.rows = []
  store.nextId = 1
  store.builderState = null
})

describe('ingestSourceRefs — canonicalização (barra final)', () => {
  it('persists the canonical value (no trailing slash) on the row AND the mirror', async () => {
    const { sources } = await ingestSourceRefs({
      ...BASE_ARGS,
      refs: [{ value: 'https://vibraresidencial.com.br/', type: 'url' }],
    })

    // Row do DB sem barra.
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0].source).toBe('https://vibraresidencial.com.br')
    // Seed retornado + espelho builderState com o MESMO valor canônico.
    expect(sources).toHaveLength(1)
    expect(sources[0].value).toBe('https://vibraresidencial.com.br')
    const state = parseBuilderState(store.builderState)
    expect(state.sourceIngestion.sources.map((s) => s.value)).toEqual([
      'https://vibraresidencial.com.br',
    ])
  })

  it('collapses with-slash + without-slash of the same site in ONE call', async () => {
    const { sources } = await ingestSourceRefs({
      ...BASE_ARGS,
      refs: [
        { value: 'https://vibraresidencial.com.br', type: 'url' },
        { value: 'https://vibraresidencial.com.br/', type: 'url' },
      ],
    })

    expect(store.rows).toHaveLength(1)
    expect(sources).toHaveLength(1)
    expect(mockEnqueue).toHaveBeenCalledTimes(1)
    expect(mockEnqueue.mock.calls[0][0]).toMatchObject({
      sourceIds: [store.rows[0].id],
    })
  })

  it('reuses the existing row on a re-paste (no duplicate in /sources/status)', async () => {
    seedRow({
      id: 'src-existing',
      source: 'https://vibraresidencial.com.br',
      status: 'ready',
    })
    store.nextId = 10

    const { sources } = await ingestSourceRefs({
      ...BASE_ARGS,
      refs: [{ value: 'https://vibraresidencial.com.br/', type: 'url' }],
    })

    // Nenhuma row nova; a existente foi resetada para pending (refresh).
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0].id).toBe('src-existing')
    expect(store.rows[0].status).toBe('pending')
    expect(mockSourceCreate).not.toHaveBeenCalled()
    // O seed/enqueue apontam para a row reusada.
    expect(sources[0].sourceId).toBe('src-existing')
    expect(mockEnqueue.mock.calls[0][0]).toMatchObject({
      sourceIds: ['src-existing'],
    })
  })

  it('heals a legacy with-slash mirror entry (mergeSources dedupes by canonical form)', async () => {
    // Espelho legado seedado COM barra (escrito antes da canonicalização).
    store.builderState = {
      sourceIngestion: {
        sources: [
          {
            value: 'https://vibraresidencial.com.br/',
            type: 'url',
            status: 'ready',
            sourceId: 'src-legacy',
          },
        ],
      },
    }

    await ingestSourceRefs({
      ...BASE_ARGS,
      refs: [{ value: 'https://vibraresidencial.com.br', type: 'url' }],
    })

    // UMA entrada só no espelho, na forma canônica, refrescada pelo novo seed.
    const state = parseBuilderState(store.builderState)
    expect(state.sourceIngestion.sources).toHaveLength(1)
    expect(state.sourceIngestion.sources[0].value).toBe(
      'https://vibraresidencial.com.br',
    )
    expect(state.sourceIngestion.sources[0].status).toBe('pending')
  })
})
