/**
 * cancel-on-inbound.test — cobre o cancelamento org-scoped, fail-open de
 * follow-ups proativos pendentes quando o cliente responde (F2b). O `db` é um
 * mock estrutural (subset { scheduledMessage: { updateMany } }).
 */

import { describe, it, expect, vi } from 'vitest'
import {
  cancelPendingProactiveOnInbound,
  type CancelOnInboundDb,
} from './cancel-on-inbound'

const ORG = 'org-1'
const PHONE = '5511999999999'

/** Mock do db cujo updateMany retorna { count } e captura os args recebidos. */
function makeDb(count: number): {
  db: CancelOnInboundDb
  updateMany: ReturnType<typeof vi.fn>
} {
  const updateMany = vi.fn(async () => ({ count }))
  return {
    db: { scheduledMessage: { updateMany } } as unknown as CancelOnInboundDb,
    updateMany,
  }
}

describe('cancelPendingProactiveOnInbound', () => {
  it('cancela só os pending + cancelIfCustomerReplies do par (org, phone) e retorna o count', async () => {
    const { db, updateMany } = makeDb(3)

    const count = await cancelPendingProactiveOnInbound(db, {
      organizationId: ORG,
      contactPhone: PHONE,
    })

    expect(count).toBe(3)
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        contactPhone: PHONE,
        status: 'pending',
        cancelIfCustomerReplies: true,
      },
      data: {
        status: 'cancelled',
        cancelledReason: 'customer_replied',
      },
    })
  })

  it('é org-scoped: o where carrega exatamente a org e o telefone passados (não vaza outras orgs/contatos)', async () => {
    const { db, updateMany } = makeDb(0)

    await cancelPendingProactiveOnInbound(db, {
      organizationId: 'org-2',
      contactPhone: '5521888888888',
    })

    const passedWhere = updateMany.mock.calls[0][0].where as {
      organizationId: string
      contactPhone: string
      status: string
      cancelIfCustomerReplies: boolean
    }
    expect(passedWhere.organizationId).toBe('org-2')
    expect(passedWhere.contactPhone).toBe('5521888888888')
    // Garante que NÃO cancela outros status nem follow-ups que ignoram resposta.
    expect(passedWhere.status).toBe('pending')
    expect(passedWhere.cancelIfCustomerReplies).toBe(true)
  })

  it('respeita cancelIfCustomerReplies: o filtro exige true (não toca follow-ups com false)', async () => {
    const { db, updateMany } = makeDb(2)

    await cancelPendingProactiveOnInbound(db, {
      organizationId: ORG,
      contactPhone: PHONE,
    })

    // O contrato com o DB garante que apenas linhas com cancelIfCustomerReplies=true
    // entram no escopo do updateMany (filtro no where), nunca as com false.
    expect(updateMany.mock.calls[0][0].where.cancelIfCustomerReplies).toBe(true)
  })

  it('retorna 0 quando nada casa (count 0) — sem erro', async () => {
    const { db } = makeDb(0)

    const count = await cancelPendingProactiveOnInbound(db, {
      organizationId: ORG,
      contactPhone: PHONE,
    })

    expect(count).toBe(0)
  })

  it('FAIL-OPEN: erro no updateMany → retorna 0 e NÃO lança', async () => {
    const updateMany = vi.fn(async () => {
      throw new Error('db down')
    })
    const db = {
      scheduledMessage: { updateMany },
    } as unknown as CancelOnInboundDb

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const count = await cancelPendingProactiveOnInbound(db, {
      organizationId: ORG,
      contactPhone: PHONE,
    })

    expect(count).toBe(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })
})
