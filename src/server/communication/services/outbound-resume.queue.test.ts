import { describe, expect, it, vi } from 'vitest'
import {
  runOutboundResumeBatch,
  type OutboundResumeDeps,
  type ResumeResendResult,
  type StuckDispatchRow,
} from './outbound-resume.queue'
import type { OutboundRequest } from './outbound.types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-06-13T12:00:00.000Z')
/** Janela padrão usada nos testes: 2min. */
const STALE_MS = 2 * 60 * 1000

/**
 * Constrói uma linha de dispatch preso. `ageMs` = quanto tempo atrás foi o
 * último update (relativo a NOW). status default 'sending'.
 */
function buildStuckRow(
  overrides: Partial<StuckDispatchRow> & { ageMs?: number } = {},
): StuckDispatchRow {
  const { ageMs = STALE_MS + 1000, ...rest } = overrides
  const key = rest.dispatchKey ?? `key-${Math.random().toString(36).slice(2)}`
  return {
    dispatchKey: key,
    organizationId: rest.organizationId ?? 'org-1',
    sessionId: rest.sessionId ?? `sess-${key}`,
    connectionId: rest.connectionId ?? 'conn-1',
    contactPhone: rest.contactPhone ?? '5511999999999',
    agentText: rest.agentText ?? 'Olá! Como posso ajudar?',
    status: rest.status ?? 'sending',
    updatedAt: rest.updatedAt ?? new Date(NOW.getTime() - ageMs),
  }
}

/** Resend de sucesso (sem erros de bloco). */
const okResend = (): Promise<ResumeResendResult> =>
  Promise.resolve({ blocksSent: 2, errors: [] })

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('runOutboundResumeBatch', () => {
  it('reenvia só os travados; o fresco é filtrado por isStuckDispatch', async () => {
    const stuckA = buildStuckRow({ dispatchKey: 'stuck-a', ageMs: STALE_MS + 5_000 })
    const stuckB = buildStuckRow({ dispatchKey: 'stuck-b', ageMs: STALE_MS + 1 })
    // Fresco: atualizado há 10s (< STALE_MS) → NÃO é preso, deve ser ignorado.
    const fresh = buildStuckRow({ dispatchKey: 'fresh-c', ageMs: 10_000 })

    const resend = vi.fn<(req: OutboundRequest) => Promise<ResumeResendResult>>(okResend)
    const findStuck = vi.fn<OutboundResumeDeps['findStuck']>(async () => [
      stuckA,
      stuckB,
      fresh,
    ])

    const result = await runOutboundResumeBatch(
      { findStuck, resend },
      { now: NOW, staleMs: STALE_MS },
    )

    expect(result.scanned).toBe(3)
    expect(result.resumed).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.errors).toEqual([])

    // resend chamado SÓ para os dois travados, nunca para o fresco.
    expect(resend).toHaveBeenCalledTimes(2)
    const resentKeys = resend.mock.calls.map(([req]) => req.dispatchKey)
    expect(resentKeys).toContain('stuck-a')
    expect(resentKeys).toContain('stuck-b')
    expect(resentKeys).not.toContain('fresh-c')

    // O OutboundRequest reconstruído carrega a MESMA dispatchKey (anti-duplicação
    // no claim do service) + o org da própria linha.
    const reqA = resend.mock.calls.find(([req]) => req.dispatchKey === 'stuck-a')?.[0]
    expect(reqA).toMatchObject({
      dispatchKey: 'stuck-a',
      organizationId: 'org-1',
      connectionId: 'conn-1',
      contactPhone: '5511999999999',
      sessionId: stuckA.sessionId,
      agentText: stuckA.agentText,
    })
  })

  it('erro num resend não derruba o batch (fail-open); o outro retoma normal', async () => {
    const bad = buildStuckRow({ dispatchKey: 'bad-1' })
    const good = buildStuckRow({ dispatchKey: 'good-1' })

    const resend = vi.fn<(req: OutboundRequest) => Promise<ResumeResendResult>>(
      async (req) => {
        if (req.dispatchKey === 'bad-1') throw new Error('boom no envio')
        return { blocksSent: 1, errors: [] }
      },
    )
    const findStuck = vi.fn<OutboundResumeDeps['findStuck']>(async () => [bad, good])

    const result = await runOutboundResumeBatch(
      { findStuck, resend },
      { now: NOW, staleMs: STALE_MS },
    )

    expect(result.scanned).toBe(2)
    // O 'good' retomou apesar do 'bad' ter lançado.
    expect(result.resumed).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('bad-1')
    expect(result.errors[0]).toContain('boom no envio')

    // Ambos foram TENTADOS (o batch não abortou no primeiro erro).
    expect(resend).toHaveBeenCalledTimes(2)
  })

  it('status fora de sending/partial é filtrado mesmo se velho', async () => {
    // 'sent' já concluído + 'queued' nunca começou → isStuckDispatch=false.
    const sent = buildStuckRow({ dispatchKey: 'sent-1', status: 'sent', ageMs: STALE_MS * 10 })
    const queued = buildStuckRow({ dispatchKey: 'queued-1', status: 'queued', ageMs: STALE_MS * 10 })
    const partial = buildStuckRow({ dispatchKey: 'partial-1', status: 'partial', ageMs: STALE_MS + 1 })

    const resend = vi.fn<(req: OutboundRequest) => Promise<ResumeResendResult>>(okResend)
    const findStuck = vi.fn<OutboundResumeDeps['findStuck']>(async () => [
      sent,
      queued,
      partial,
    ])

    const result = await runOutboundResumeBatch(
      { findStuck, resend },
      { now: NOW, staleMs: STALE_MS },
    )

    expect(result.scanned).toBe(3)
    expect(result.resumed).toBe(1)
    expect(resend).toHaveBeenCalledTimes(1)
    expect(resend.mock.calls[0][0].dispatchKey).toBe('partial-1')
  })

  it('findStuck que lança não derruba o cron (fail-open: batch vazio)', async () => {
    const resend = vi.fn<(req: OutboundRequest) => Promise<ResumeResendResult>>(okResend)
    const findStuck = vi.fn<OutboundResumeDeps['findStuck']>(async () => {
      throw new Error('DB indisponível')
    })

    const result = await runOutboundResumeBatch(
      { findStuck, resend },
      { now: NOW, staleMs: STALE_MS },
    )

    expect(result.scanned).toBe(0)
    expect(result.resumed).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(resend).not.toHaveBeenCalled()
  })

  it('resend que reporta erros de bloco ainda conta como resumed (turno retomado)', async () => {
    const row = buildStuckRow({ dispatchKey: 'partial-blocks' })
    const resend = vi.fn<(req: OutboundRequest) => Promise<ResumeResendResult>>(
      async () => ({ blocksSent: 1, errors: ['bloco 2 falhou'] }),
    )
    const findStuck = vi.fn<OutboundResumeDeps['findStuck']>(async () => [row])

    const result = await runOutboundResumeBatch(
      { findStuck, resend },
      { now: NOW, staleMs: STALE_MS },
    )

    expect(result.resumed).toBe(1)
    expect(result.failed).toBe(0)
    // Erros de BLOCO não entram em errors[] do batch (só erros que LANÇAM).
    expect(result.errors).toEqual([])
  })

  it('respeita o limit padrão e o injetado ao chamar findStuck', async () => {
    const findStuck = vi.fn<OutboundResumeDeps['findStuck']>(async () => [])
    const resend = vi.fn<(req: OutboundRequest) => Promise<ResumeResendResult>>(okResend)

    await runOutboundResumeBatch({ findStuck, resend }, { now: NOW })
    expect(findStuck).toHaveBeenCalledWith({ limit: 50 })

    await runOutboundResumeBatch({ findStuck, resend }, { now: NOW, limit: 7 })
    expect(findStuck).toHaveBeenLastCalledWith({ limit: 7 })
  })
})
