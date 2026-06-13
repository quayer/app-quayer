/**
 * Unit tests do `trackJourneyEvent` (funil da Jornada Builder v2 — T59).
 *
 *  - Caminho feliz: grava UMA linha em `builder_journey_events` com os campos
 *    do contrato (mock que resolve).
 *  - Fail-open (NFR-04): erro de DB NUNCA lança — resolve silenciosamente
 *    (mock que rejeita).
 *  - Metadata: omitida quando ausente; passada quando presente.
 *
 * O delegate `database.builderJourneyEvent` é mockado — sem IO real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { trackJourneyEvent, type TrackJourneyEventInput } from './journey-events'

const create = vi.fn()

vi.mock('@/server/services/database', () => ({
  database: {
    builderJourneyEvent: {
      create: (...args: unknown[]) => create(...args),
    },
  },
}))

describe('trackJourneyEvent', () => {
  beforeEach(() => {
    create.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('grava o evento no caminho feliz (mock resolve)', async () => {
    create.mockResolvedValue({ id: 'evt_1' })

    await trackJourneyEvent({
      organizationId: 'org_1',
      projectId: 'proj_1',
      journeyVersion: 2,
      event: 'journey_started',
    })

    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org_1',
        projectId: 'proj_1',
        journeyVersion: 2,
        event: 'journey_started',
      },
    })
  })

  it('inclui metadata do contrato fechado quando fornecida', async () => {
    create.mockResolvedValue({ id: 'evt_2' })

    await trackJourneyEvent({
      organizationId: 'org_1',
      projectId: 'proj_1',
      journeyVersion: 2,
      event: 'channel_connected',
      metadata: { platform: 'whatsapp', provider: 'uazapi' },
    })

    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org_1',
        projectId: 'proj_1',
        journeyVersion: 2,
        event: 'channel_connected',
        metadata: { platform: 'whatsapp', provider: 'uazapi' },
      },
    })
  })

  it('mantém o contrato TS sem metadata livre para eventos que não declaram shape', () => {
    const valid: TrackJourneyEventInput = {
      organizationId: 'org_1',
      projectId: 'proj_1',
      journeyVersion: 2,
      event: 'published',
      metadata: { versionNumber: 3 },
    }

    const invalid: TrackJourneyEventInput = {
      organizationId: 'org_1',
      projectId: 'proj_1',
      journeyVersion: 2,
      event: 'identity_done',
      // @ts-expect-error identity_done não aceita metadata arbitrária/PII.
      metadata: { phone: '+5511999999999' },
    }

    expect(valid.metadata).toEqual({ versionNumber: 3 })
    void invalid
  })

  it('omite a chave metadata do data quando ausente', async () => {
    create.mockResolvedValue({ id: 'evt_3' })

    await trackJourneyEvent({
      organizationId: 'org_1',
      projectId: 'proj_1',
      journeyVersion: 1,
      event: 'published',
    })

    const data = create.mock.calls[0][0].data as Record<string, unknown>
    expect('metadata' in data).toBe(false)
  })

  it('NÃO lança quando o DB rejeita (fail-open NFR-04)', async () => {
    create.mockRejectedValue(new Error('connection refused'))

    await expect(
      trackJourneyEvent({
        organizationId: 'org_1',
        projectId: 'proj_1',
        journeyVersion: 2,
        event: 'review_done',
      }),
    ).resolves.toBeUndefined()

    expect(create).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[journey-v2]'),
      expect.any(Error),
    )
  })
})
