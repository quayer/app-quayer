/**
 * journey-events-purge.job — unit (NFR-10 / plan §6.2, §7.1)
 *
 * Rodar:
 *   npx vitest run src/server/services/jobs/journey-events-purge.job.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  JOURNEY_EVENTS_RETENTION_DAYS,
  runJourneyEventsPurge,
  type JourneyEventsPurgePrismaLike,
} from './journey-events-purge.job'

/** Mock mínimo do Prisma com só o método que o job chama. */
type PrismaMock = {
  builderJourneyEvent: { deleteMany: ReturnType<typeof vi.fn> }
}

function makePrismaMock(deletedCount = 0): PrismaMock {
  return {
    builderJourneyEvent: {
      deleteMany: vi.fn().mockResolvedValue({ count: deletedCount }),
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
    const db: PrismaMock = {
      builderJourneyEvent: {
        deleteMany: vi.fn().mockRejectedValue(new Error('db down')),
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
    }

    const first = await runJourneyEventsPurge(asDb(db))
    const second = await runJourneyEventsPurge(asDb(db))

    expect(first).toEqual({ deleted: 2 })
    expect(second).toEqual({ deleted: 0 })
    expect(db.builderJourneyEvent.deleteMany).toHaveBeenCalledTimes(2)
  })
})
