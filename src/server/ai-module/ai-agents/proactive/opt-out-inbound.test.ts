/**
 * opt-out-inbound.test — cobre a aplicação org-scoped, idempotente e fail-open do
 * opt-out de proatividade (FR-PRO-08). `db` é um mock estrutural
 * { contactOptOut: { upsert }, scheduledMessage: { updateMany } }.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  handleOptOutOnInbound,
  type OptOutInboundDb,
} from './opt-out-inbound'

const ORG = 'org-1'
const PHONE = '5511999999999'

function makeDb(cancelCount: number): {
  db: OptOutInboundDb
  upsert: ReturnType<typeof vi.fn>
  updateMany: ReturnType<typeof vi.fn>
} {
  const upsert = vi.fn(async () => ({ id: 'oo-1' }))
  const updateMany = vi.fn(async () => ({ count: cancelCount }))
  return {
    db: {
      contactOptOut: { upsert },
      scheduledMessage: { updateMany },
    } as unknown as OptOutInboundDb,
    upsert,
    updateMany,
  }
}

describe('handleOptOutOnInbound', () => {
  it('texto NÃO-opt-out → no-op (não toca DB)', async () => {
    const { db, upsert, updateMany } = makeDb(0)
    const r = await handleOptOutOnInbound(db, {
      organizationId: ORG,
      contactPhone: PHONE,
      text: 'qual o valor do produto?',
    })
    expect(r).toEqual({ optedOut: false, cancelled: 0 })
    expect(upsert).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('opt-out → upsert ContactOptOut (org-scoped) + cancela TODOS os pendentes', async () => {
    const { db, upsert, updateMany } = makeDb(2)
    const r = await handleOptOutOnInbound(db, {
      organizationId: ORG,
      contactPhone: PHONE,
      text: 'não quero mais receber mensagens',
    })

    expect(r).toEqual({ optedOut: true, cancelled: 2 })

    // upsert org-scoped pela chave composta
    const upsertArg = upsert.mock.calls[0][0]
    expect(upsertArg.where.organizationId_phone).toEqual({
      organizationId: ORG,
      phone: PHONE,
    })
    expect(upsertArg.create.organizationId).toBe(ORG)
    expect(upsertArg.create.phone).toBe(PHONE)

    // cancela TODOS os pending (sem filtro cancelIfCustomerReplies), reason opted_out
    const updArg = updateMany.mock.calls[0][0]
    expect(updArg.where).toEqual({
      organizationId: ORG,
      contactPhone: PHONE,
      status: 'pending',
    })
    expect(updArg.data).toEqual({
      status: 'cancelled',
      cancelledReason: 'opted_out',
    })
  })

  it('comando isolado "parar" → opt-out', async () => {
    const { db } = makeDb(0)
    const r = await handleOptOutOnInbound(db, {
      organizationId: ORG,
      contactPhone: PHONE,
      text: 'PARAR',
    })
    expect(r.optedOut).toBe(true)
  })

  it('FAIL-OPEN: erro no upsert → optedOut:true, cancelled:0, NÃO lança', async () => {
    const upsert = vi.fn(async () => {
      throw new Error('db down')
    })
    const updateMany = vi.fn(async () => ({ count: 0 }))
    const db = {
      contactOptOut: { upsert },
      scheduledMessage: { updateMany },
    } as unknown as OptOutInboundDb
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const r = await handleOptOutOnInbound(db, {
      organizationId: ORG,
      contactPhone: PHONE,
      text: 'cancelar mensagens',
    })

    expect(r).toEqual({ optedOut: true, cancelled: 0 })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('text null/undefined → no-op', async () => {
    const { db, upsert } = makeDb(0)
    expect(
      await handleOptOutOnInbound(db, {
        organizationId: ORG,
        contactPhone: PHONE,
        text: null,
      }),
    ).toEqual({ optedOut: false, cancelled: 0 })
    expect(upsert).not.toHaveBeenCalled()
  })
})
