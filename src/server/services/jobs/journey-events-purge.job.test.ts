/**
 * journey-events-purge.job — unit (NFR-10 / plan §6.2, §7.1)
 *
 * Rodar:
 *   npx vitest run src/server/services/jobs/journey-events-purge.job.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  JOURNEY_EVENTS_RETENTION_DAYS,
  V1_DRAFT_INACTIVITY_DAYS,
  runJourneyEventsPurge,
  runV1DraftArchive,
  type JourneyEventsPurgePrismaLike,
} from './journey-events-purge.job'

/** Linha de candidato a arquivamento (shape do select de runV1DraftArchive). */
type DraftRow = {
  id: string
  conversation: { builderState: unknown } | null
}

/**
 * Mock mínimo do Prisma com os métodos que o job chama. Por padrão o
 * `builderProject.findMany` devolve [] — assim os testes da PURGA não precisam
 * se importar com o passo de arquivamento (ele vira no-op).
 */
type PrismaMock = {
  builderJourneyEvent: { deleteMany: ReturnType<typeof vi.fn> }
  builderProject: {
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

function makePrismaMock(deletedCount = 0, draftRows: DraftRow[] = []): PrismaMock {
  return {
    builderJourneyEvent: {
      deleteMany: vi.fn().mockResolvedValue({ count: deletedCount }),
    },
    builderProject: {
      findMany: vi.fn().mockResolvedValue(draftRows),
      update: vi.fn().mockResolvedValue({ id: 'updated' }),
    },
  }
}

const asDb = (m: PrismaMock): JourneyEventsPurgePrismaLike =>
  m as unknown as JourneyEventsPurgePrismaLike

describe('runJourneyEventsPurge', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Relógio fixo para tornar o corte determinístico.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    errorSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('apaga apenas eventos com createdAt anterior ao corte de 180 dias', async () => {
    const db = makePrismaMock(3)

    const result = await runJourneyEventsPurge(asDb(db))

    expect(db.builderJourneyEvent.deleteMany).toHaveBeenCalledTimes(1)
    const args = db.builderJourneyEvent.deleteMany.mock.calls[0][0]
    expect(args.where.createdAt.lt).toBeInstanceOf(Date)

    const cutoff = args.where.createdAt.lt as Date
    const expected = new Date(
      Date.now() - JOURNEY_EVENTS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    )
    expect(cutoff.getTime()).toBe(expected.getTime())

    // O filtro é estritamente `lt` (somente eventos MAIS VELHOS que o corte).
    expect(args.where.createdAt).not.toHaveProperty('gte')
    expect(args.where.createdAt).not.toHaveProperty('lte')

    expect(result).toEqual({ deleted: 3 })
  })

  it('fail-open: nunca lança e loga [journey-v2] quando o DELETE falha', async () => {
    // builderProject vazio → o passo de arquivamento é no-op e não loga; o
    // único erro logado é o do DELETE da purga.
    const db: PrismaMock = {
      builderJourneyEvent: {
        deleteMany: vi.fn().mockRejectedValue(new Error('db down')),
      },
      builderProject: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
    }

    const result = await runJourneyEventsPurge(asDb(db))

    expect(result).toEqual({ deleted: 0 })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('[journey-v2]')
  })

  it('idempotente: rodar 2x seguidas não erra (2ª passada apaga 0)', async () => {
    // 1ª passada apaga 2 linhas; 2ª já não encontra nada vencido.
    const db: PrismaMock = {
      builderJourneyEvent: {
        deleteMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 2 })
          .mockResolvedValueOnce({ count: 0 }),
      },
      builderProject: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
    }

    const first = await runJourneyEventsPurge(asDb(db))
    const second = await runJourneyEventsPurge(asDb(db))

    expect(first).toEqual({ deleted: 2 })
    expect(second).toEqual({ deleted: 0 })
    expect(db.builderJourneyEvent.deleteMany).toHaveBeenCalledTimes(2)
  })

  it('roda o arquivamento de drafts v1 na MESMA rotina (sem cron adicional)', async () => {
    // Um draft v1 inativo na fila → a purga dispara o arquivamento e o update
    // do arquivo acontece sem que o contrato { deleted } da purga mude.
    const db = makePrismaMock(1, [{ id: 'v1', conversation: { builderState: { journeyVersion: 1 } } }])

    const result = await runJourneyEventsPurge(asDb(db))

    expect(result).toEqual({ deleted: 1 }) // contrato T88 intacto
    expect(db.builderProject.update).toHaveBeenCalledTimes(1)
    expect(db.builderProject.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'v1' },
      data: { status: 'archived' },
    })
  })

  it('falha no arquivamento NÃO impede a purga (passos isolados)', async () => {
    const db = makePrismaMock(4)
    db.builderProject.findMany.mockRejectedValueOnce(new Error('boom'))

    const result = await runJourneyEventsPurge(asDb(db))

    // A purga ainda apaga seus 4 eventos mesmo com o arquivamento estourando.
    expect(result).toEqual({ deleted: 4 })
    expect(errorSpy).toHaveBeenCalled()
    expect(db.builderJourneyEvent.deleteMany).toHaveBeenCalledTimes(1)
  })
})

describe('runV1DraftArchive', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    errorSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('varre só draft inativo > 90 dias (status=draft + updatedAt < corte)', async () => {
    const db = makePrismaMock(0, [])

    await runV1DraftArchive(asDb(db))

    expect(db.builderProject.findMany).toHaveBeenCalledTimes(1)
    const args = db.builderProject.findMany.mock.calls[0][0]
    expect(args.where.status).toBe('draft')
    expect(args.where.updatedAt.lt).toBeInstanceOf(Date)

    const cutoff = args.where.updatedAt.lt as Date
    const expected = new Date(
      Date.now() - V1_DRAFT_INACTIVITY_DAYS * 24 * 60 * 60 * 1000,
    )
    expect(cutoff.getTime()).toBe(expected.getTime())
    // Estritamente `lt` — só projetos MAIS VELHOS que o corte.
    expect(args.where.updatedAt).not.toHaveProperty('gte')
    // Traz o journeyVersion da conversa 1:1 para decidir v1 vs v2 no código.
    expect(args.select.conversation.select.builderState).toBe(true)
  })

  it('arquiva drafts v1 (inclui legado: builderState null/ausente) e ignora v2', async () => {
    const db = makePrismaMock(0, [
      { id: 'v1-explicit', conversation: { builderState: { journeyVersion: 1 } } },
      { id: 'v1-legacy-null-state', conversation: { builderState: null } },
      { id: 'v1-legacy-no-conversation', conversation: null },
      { id: 'v1-legacy-no-version', conversation: { builderState: { foo: 'bar' } } },
      { id: 'v2-skip', conversation: { builderState: { journeyVersion: 2 } } },
    ])

    const result = await runV1DraftArchive(asDb(db))

    // Os 4 v1 (explícito + 3 legados) arquivam; o v2 fica intocado.
    expect(result).toEqual({ archived: 4 })
    expect(db.builderProject.update).toHaveBeenCalledTimes(4)

    const archivedIds = db.builderProject.update.mock.calls.map(
      (c) => c[0].where.id,
    )
    expect(archivedIds).toEqual([
      'v1-explicit',
      'v1-legacy-null-state',
      'v1-legacy-no-conversation',
      'v1-legacy-no-version',
    ])
    expect(archivedIds).not.toContain('v2-skip')

    // Reusa o mecanismo de arquivamento existente (status + archivedAt).
    for (const call of db.builderProject.update.mock.calls) {
      expect(call[0].data.status).toBe('archived')
      expect(call[0].data.archivedAt).toBeInstanceOf(Date)
    }
  })

  it('idempotente: 2ª passada (já arquivados saem do filtro draft) não re-arquiva', async () => {
    const db = makePrismaMock(0)
    db.builderProject.findMany
      .mockResolvedValueOnce([
        { id: 'v1', conversation: { builderState: { journeyVersion: 1 } } },
      ])
      .mockResolvedValueOnce([]) // já arquivado → fora do filtro status=draft

    const first = await runV1DraftArchive(asDb(db))
    const second = await runV1DraftArchive(asDb(db))

    expect(first).toEqual({ archived: 1 })
    expect(second).toEqual({ archived: 0 })
    expect(db.builderProject.update).toHaveBeenCalledTimes(1)
  })

  it('fail-open: erro na QUERY nunca lança e loga [journey-v2]', async () => {
    const db = makePrismaMock(0)
    db.builderProject.findMany.mockRejectedValueOnce(new Error('db down'))

    const result = await runV1DraftArchive(asDb(db))

    expect(result).toEqual({ archived: 0 })
    expect(db.builderProject.update).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('[journey-v2]')
  })

  it('fail-open por projeto: erro em um update não aborta o loop', async () => {
    const db = makePrismaMock(0, [
      { id: 'fails', conversation: { builderState: { journeyVersion: 1 } } },
      { id: 'ok', conversation: { builderState: { journeyVersion: 1 } } },
    ])
    db.builderProject.update
      .mockRejectedValueOnce(new Error('update boom'))
      .mockResolvedValueOnce({ id: 'ok' })

    const result = await runV1DraftArchive(asDb(db))

    // O segundo ainda arquiva apesar do primeiro falhar.
    expect(result).toEqual({ archived: 1 })
    expect(db.builderProject.update).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('[journey-v2]')
  })

  it('não arquiva nada quando não há draft v1 inativo (varredura vazia)', async () => {
    const db = makePrismaMock(0, [])

    const result = await runV1DraftArchive(asDb(db))

    expect(result).toEqual({ archived: 0 })
    expect(db.builderProject.update).not.toHaveBeenCalled()
  })
})
