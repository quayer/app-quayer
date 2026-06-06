/**
 * Unit tests da idempotência durável de turno (decisionIdempotencyKey).
 *
 * computeDecisionIdempotencyKey: chave estável + desativada sem inbound/configHash.
 * claimRuntimeTurn: 1º reivindica; duplicado CONCLUÍDO bloqueia; 'pending' (crash)
 * reprocessa; erro inesperado fail-open.
 * recordRuntimeDecision: upsert quando há chave, create quando não há.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const database = vi.hoisted(() => ({
  agentRuntimeDecision: {
    create: vi.fn(),
    upsert: vi.fn(),
    findUnique: vi.fn(),
  },
}))

vi.mock('@/server/services/database', () => ({ database }))

import {
  computeDecisionIdempotencyKey,
  claimRuntimeTurn,
  recordRuntimeDecision,
} from './runtime-decision.service'

const baseClaim = {
  decisionIdempotencyKey: 'key_abc',
  organizationId: 'org_1',
  sessionId: 'sess_1',
  agentConfigId: 'agent_1',
  executionMode: 'sync' as const,
  modelPrimary: 'gpt-4o',
  providerPrimary: 'openai',
}

const baseRecord = {
  organizationId: 'org_1',
  sessionId: 'sess_1',
  agentConfigId: 'agent_1',
  executionMode: 'sync' as const,
  modelPrimary: 'gpt-4o',
  providerPrimary: 'openai',
  modelUsed: 'gpt-4o',
  providerUsed: 'openai',
}

describe('computeDecisionIdempotencyKey', () => {
  it('retorna null sem inboundMessageId (idempotência desativada)', () => {
    expect(computeDecisionIdempotencyKey('s', undefined, 'cfg')).toBeNull()
    expect(computeDecisionIdempotencyKey('s', '', 'cfg')).toBeNull()
  })

  it('retorna null sem configHash', () => {
    expect(computeDecisionIdempotencyKey('s', 'msg_1', null)).toBeNull()
  })

  it('é estável (mesmos inputs → mesma chave) e hex de 64 chars', () => {
    const a = computeDecisionIdempotencyKey('s', 'msg_1', 'cfg')
    const b = computeDecisionIdempotencyKey('s', 'msg_1', 'cfg')
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })

  it('configHash diferente → chave diferente (editar agente permite re-dispatch)', () => {
    const a = computeDecisionIdempotencyKey('s', 'msg_1', 'cfg_v1')
    const b = computeDecisionIdempotencyKey('s', 'msg_1', 'cfg_v2')
    expect(a).not.toBe(b)
  })

  it('inboundMessageId diferente → chave diferente', () => {
    const a = computeDecisionIdempotencyKey('s', 'msg_1', 'cfg')
    const b = computeDecisionIdempotencyKey('s', 'msg_2', 'cfg')
    expect(a).not.toBe(b)
  })
})

describe('claimRuntimeTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1º a reivindicar → true, cria linha pending com a chave', async () => {
    database.agentRuntimeDecision.create.mockResolvedValue({ id: 'd1' })

    const ok = await claimRuntimeTurn(baseClaim)

    expect(ok).toBe(true)
    expect(database.agentRuntimeDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decisionIdempotencyKey: 'key_abc',
          status: 'pending',
          modelUsed: 'gpt-4o',
          providerUsed: 'openai',
        }),
      }),
    )
  })

  it('duplicado JÁ CONCLUÍDO (P2002 + status terminal) → false (short-circuit)', async () => {
    database.agentRuntimeDecision.create.mockRejectedValue({ code: 'P2002' })
    database.agentRuntimeDecision.findUnique.mockResolvedValue({ status: 'success' })

    const ok = await claimRuntimeTurn(baseClaim)

    expect(ok).toBe(false)
  })

  it("'pending' (tentativa anterior travada) → true, permite reprocessar", async () => {
    database.agentRuntimeDecision.create.mockRejectedValue({ code: 'P2002' })
    database.agentRuntimeDecision.findUnique.mockResolvedValue({ status: 'pending' })

    const ok = await claimRuntimeTurn(baseClaim)

    expect(ok).toBe(true)
  })

  it('erro inesperado (não-P2002) → true (fail-open, processa)', async () => {
    database.agentRuntimeDecision.create.mockRejectedValue(new Error('db down'))

    const ok = await claimRuntimeTurn(baseClaim)

    expect(ok).toBe(true)
    expect(database.agentRuntimeDecision.findUnique).not.toHaveBeenCalled()
  })
})

describe('recordRuntimeDecision — idempotência', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('com chave → upsert pela decisionIdempotencyKey (atualiza o pending)', async () => {
    database.agentRuntimeDecision.upsert.mockResolvedValue({ id: 'd1' })

    await recordRuntimeDecision({
      ...baseRecord,
      status: 'success',
      decisionIdempotencyKey: 'key_abc',
    })

    expect(database.agentRuntimeDecision.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { decisionIdempotencyKey: 'key_abc' },
        create: expect.objectContaining({ decisionIdempotencyKey: 'key_abc', status: 'success' }),
        update: expect.objectContaining({ status: 'success' }),
      }),
    )
    expect(database.agentRuntimeDecision.create).not.toHaveBeenCalled()
  })

  it('sem chave → create (comportamento legado)', async () => {
    database.agentRuntimeDecision.create.mockResolvedValue({ id: 'd1' })

    await recordRuntimeDecision({ ...baseRecord, status: 'success' })

    expect(database.agentRuntimeDecision.create).toHaveBeenCalled()
    expect(database.agentRuntimeDecision.upsert).not.toHaveBeenCalled()
  })

  it('nunca lança (fire-and-forget) mesmo se o upsert falhar', async () => {
    database.agentRuntimeDecision.upsert.mockRejectedValue(new Error('boom'))

    await expect(
      recordRuntimeDecision({
        ...baseRecord,
        status: 'error',
        decisionIdempotencyKey: 'key_abc',
      }),
    ).resolves.toBeUndefined()
  })
})
