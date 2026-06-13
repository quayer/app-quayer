import { describe, expect, it } from 'vitest'
import { createHash } from 'crypto'
import {
  applyBlockResult,
  deriveDispatchKey,
  initBlockPlan,
  isStuckDispatch,
  resumeDecision,
  shouldSendBlock,
  summarizeStatus,
  type BlockCheckpoint,
} from './outbound-dispatch.pure'

describe('deriveDispatchKey', () => {
  it('é determinístico: mesma entrada → mesmo hash', () => {
    const a = deriveDispatchKey('sess-1', 'msg-1')
    const b = deriveDispatchKey('sess-1', 'msg-1')
    expect(a).toBe(b)
  })

  it('entradas diferentes → hashes diferentes', () => {
    expect(deriveDispatchKey('sess-1', 'msg-1')).not.toBe(deriveDispatchKey('sess-1', 'msg-2'))
    expect(deriveDispatchKey('sess-1', 'msg-1')).not.toBe(deriveDispatchKey('sess-2', 'msg-1'))
  })

  it('casa com sha256 hex de `${sessionId}:${inboundMessageId}`', () => {
    const expected = createHash('sha256').update('sess-x:msg-y').digest('hex')
    expect(deriveDispatchKey('sess-x', 'msg-y')).toBe(expected)
  })

  it('produz hex de 64 chars', () => {
    expect(deriveDispatchKey('a', 'b')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('o separador `:` evita colisão entre fronteiras de campos', () => {
    // "ab" + "c" vs "a" + "bc" devem diferir por causa do separador.
    expect(deriveDispatchKey('ab', 'c')).not.toBe(deriveDispatchKey('a', 'bc'))
  })
})

describe('initBlockPlan', () => {
  it('cria N blocos pending', () => {
    expect(initBlockPlan(3)).toEqual([
      { idx: 0, status: 'pending' },
      { idx: 1, status: 'pending' },
      { idx: 2, status: 'pending' },
    ])
  })

  it('totalBlocks 0 → []', () => {
    expect(initBlockPlan(0)).toEqual([])
  })

  it('totalBlocks negativo → []', () => {
    expect(initBlockPlan(-5)).toEqual([])
  })

  it('NaN/Infinity → []', () => {
    expect(initBlockPlan(Number.NaN)).toEqual([])
    expect(initBlockPlan(Number.POSITIVE_INFINITY)).toEqual([])
  })

  it('não-inteiro é truncado p/ floor', () => {
    expect(initBlockPlan(2.9)).toHaveLength(2)
  })

  it('blocos têm índices sequenciais a partir de 0', () => {
    expect(initBlockPlan(2).map((b) => b.idx)).toEqual([0, 1])
  })
})

describe('resumeDecision', () => {
  it('null → fresh', () => {
    expect(resumeDecision(null)).toEqual({ action: 'fresh' })
  })

  it("'queued' → fresh", () => {
    expect(resumeDecision({ status: 'queued', blocks: [] })).toEqual({ action: 'fresh' })
  })

  it("'sent' → skip (idempotência)", () => {
    expect(resumeDecision({ status: 'sent', blocks: [{ idx: 0, status: 'sent' }] })).toEqual({
      action: 'skip',
    })
  })

  it("'sending' → resume com sentIdx dos blocos 'sent'", () => {
    const blocks = [
      { idx: 0, status: 'sent', providerMessageId: 'p0' },
      { idx: 1, status: 'pending' },
      { idx: 2, status: 'sent', providerMessageId: 'p2' },
    ]
    expect(resumeDecision({ status: 'sending', blocks })).toEqual({
      action: 'resume',
      sentIdx: [0, 2],
    })
  })

  it("'partial' → resume com sentIdx dos blocos 'sent'", () => {
    const blocks = [
      { idx: 0, status: 'sent' },
      { idx: 1, status: 'failed' },
    ]
    expect(resumeDecision({ status: 'partial', blocks })).toEqual({
      action: 'resume',
      sentIdx: [0],
    })
  })

  it("'sending' com blocks corrompido (não-array) → resume sentIdx=[]", () => {
    expect(resumeDecision({ status: 'sending', blocks: 'lixo' })).toEqual({
      action: 'resume',
      sentIdx: [],
    })
  })

  it("'sending' com blocks null → resume sentIdx=[]", () => {
    expect(resumeDecision({ status: 'sending', blocks: null })).toEqual({
      action: 'resume',
      sentIdx: [],
    })
  })

  it('status desconhecido COM checkpoint parseável → resume (anti-duplicação)', () => {
    const blocks = [
      { idx: 0, status: 'sent' },
      { idx: 1, status: 'pending' },
    ]
    expect(resumeDecision({ status: 'weird', blocks })).toEqual({
      action: 'resume',
      sentIdx: [0],
    })
  })

  it('status desconhecido SEM checkpoint parseável → fresh', () => {
    expect(resumeDecision({ status: 'weird', blocks: 42 })).toEqual({ action: 'fresh' })
    expect(resumeDecision({ status: 'weird', blocks: [] })).toEqual({ action: 'fresh' })
  })

  it('ignora entradas malformadas dentro do array de blocks', () => {
    const blocks = [
      { idx: 0, status: 'sent' },
      null,
      'lixo',
      { status: 'sent' }, // sem idx
      { idx: 'x', status: 'sent' }, // idx não numérico
      { idx: 3, status: 'sent' },
    ]
    expect(resumeDecision({ status: 'sending', blocks })).toEqual({
      action: 'resume',
      sentIdx: [0, 3],
    })
  })
})

describe('shouldSendBlock', () => {
  const plan: BlockCheckpoint[] = [
    { idx: 0, status: 'sent' },
    { idx: 1, status: 'pending' },
    { idx: 2, status: 'failed' },
  ]

  it('bloco sent → false', () => {
    expect(shouldSendBlock(plan, 0)).toBe(false)
  })

  it('bloco pending → true', () => {
    expect(shouldSendBlock(plan, 1)).toBe(true)
  })

  it('bloco failed → true (precisa reenviar)', () => {
    expect(shouldSendBlock(plan, 2)).toBe(true)
  })

  it('idx fora do range → true (não há registro de envio)', () => {
    expect(shouldSendBlock(plan, 99)).toBe(true)
  })

  it('plano vazio → true', () => {
    expect(shouldSendBlock([], 0)).toBe(true)
  })
})

describe('applyBlockResult', () => {
  const base: BlockCheckpoint[] = [
    { idx: 0, status: 'pending' },
    { idx: 1, status: 'pending' },
  ]

  it('success → marca sent + providerMessageId', () => {
    const next = applyBlockResult(base, 0, { success: true, providerMessageId: 'pmid-0' })
    expect(next[0]).toEqual({ idx: 0, status: 'sent', providerMessageId: 'pmid-0' })
    expect(next[1]).toEqual({ idx: 1, status: 'pending' })
  })

  it('success sem providerMessageId → sent sem campo', () => {
    const next = applyBlockResult(base, 0, { success: true })
    expect(next[0]).toEqual({ idx: 0, status: 'sent' })
    expect(next[0]).not.toHaveProperty('providerMessageId')
  })

  it('!success → marca failed', () => {
    const next = applyBlockResult(base, 1, { success: false })
    expect(next[1]).toEqual({ idx: 1, status: 'failed' })
  })

  it('é imutável: não muta o plano original', () => {
    const snapshot = JSON.parse(JSON.stringify(base))
    applyBlockResult(base, 0, { success: true, providerMessageId: 'x' })
    expect(base).toEqual(snapshot)
  })

  it('retorna nova referência de array', () => {
    const next = applyBlockResult(base, 0, { success: true })
    expect(next).not.toBe(base)
  })

  it('idx fora do range → plano inalterado (cópia)', () => {
    const next = applyBlockResult(base, 99, { success: true, providerMessageId: 'x' })
    expect(next).toEqual(base)
    expect(next).not.toBe(base)
  })

  it('plano vazio → []', () => {
    expect(applyBlockResult([], 0, { success: true })).toEqual([])
  })
})

describe('summarizeStatus', () => {
  it('todos sent → sent', () => {
    const plan: BlockCheckpoint[] = [
      { idx: 0, status: 'sent' },
      { idx: 1, status: 'sent' },
    ]
    expect(summarizeStatus(plan)).toEqual({ status: 'sent', sentBlocks: 2, totalBlocks: 2 })
  })

  it('alguns sent → partial', () => {
    const plan: BlockCheckpoint[] = [
      { idx: 0, status: 'sent' },
      { idx: 1, status: 'failed' },
    ]
    expect(summarizeStatus(plan)).toEqual({ status: 'partial', sentBlocks: 1, totalBlocks: 2 })
  })

  it('nenhum sent → failed', () => {
    const plan: BlockCheckpoint[] = [
      { idx: 0, status: 'failed' },
      { idx: 1, status: 'pending' },
    ]
    expect(summarizeStatus(plan)).toEqual({ status: 'failed', sentBlocks: 0, totalBlocks: 2 })
  })

  it('plano vazio → sent/0/0 (nada a fazer é sucesso)', () => {
    expect(summarizeStatus([])).toEqual({ status: 'sent', sentBlocks: 0, totalBlocks: 0 })
  })

  it('um único bloco sent → sent/1/1', () => {
    expect(summarizeStatus([{ idx: 0, status: 'sent' }])).toEqual({
      status: 'sent',
      sentBlocks: 1,
      totalBlocks: 1,
    })
  })
})

describe('isStuckDispatch', () => {
  const now = new Date('2026-06-13T12:00:00.000Z')
  const staleMs = 60_000

  it("'sending' além do staleMs → true", () => {
    const row = { status: 'sending', updatedAt: new Date('2026-06-13T11:58:00.000Z') }
    expect(isStuckDispatch(row, now, staleMs)).toBe(true)
  })

  it("'partial' além do staleMs → true", () => {
    const row = { status: 'partial', updatedAt: new Date('2026-06-13T11:58:00.000Z') }
    expect(isStuckDispatch(row, now, staleMs)).toBe(true)
  })

  it("'sent' nunca é stuck", () => {
    const row = { status: 'sent', updatedAt: new Date('2026-06-13T00:00:00.000Z') }
    expect(isStuckDispatch(row, now, staleMs)).toBe(false)
  })

  it("'queued' nunca é stuck", () => {
    const row = { status: 'queued', updatedAt: new Date('2026-06-13T00:00:00.000Z') }
    expect(isStuckDispatch(row, now, staleMs)).toBe(false)
  })

  it('dentro do staleMs → false', () => {
    const row = { status: 'sending', updatedAt: new Date('2026-06-13T11:59:30.000Z') }
    expect(isStuckDispatch(row, now, staleMs)).toBe(false)
  })

  it('borda EXATA do staleMs → true (>=)', () => {
    const row = { status: 'sending', updatedAt: new Date('2026-06-13T11:59:00.000Z') }
    expect(isStuckDispatch(row, now, staleMs)).toBe(true)
  })

  it('1ms antes da borda → false', () => {
    const row = { status: 'sending', updatedAt: new Date('2026-06-13T11:59:00.001Z') }
    expect(isStuckDispatch(row, now, staleMs)).toBe(false)
  })

  it('updatedAt inválido (NaN) → false (fail-safe)', () => {
    const row = { status: 'sending', updatedAt: new Date('invalid') }
    expect(isStuckDispatch(row, now, staleMs)).toBe(false)
  })

  it('now inválido (NaN) → false (fail-safe)', () => {
    const row = { status: 'sending', updatedAt: new Date('2026-06-13T11:00:00.000Z') }
    expect(isStuckDispatch(row, new Date('invalid'), staleMs)).toBe(false)
  })

  it('staleMs não-finito → false (fail-safe)', () => {
    const row = { status: 'sending', updatedAt: new Date('2026-06-13T11:00:00.000Z') }
    expect(isStuckDispatch(row, now, Number.POSITIVE_INFINITY)).toBe(false)
    expect(isStuckDispatch(row, now, Number.NaN)).toBe(false)
  })

  it('staleMs=0 → true se sending/partial (now >= updatedAt)', () => {
    const row = { status: 'sending', updatedAt: now }
    expect(isStuckDispatch(row, now, 0)).toBe(true)
  })
})
