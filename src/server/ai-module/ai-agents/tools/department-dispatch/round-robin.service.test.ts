/**
 * round-robin.service — Vitest unit (M1, roleta re-chaveada por memberId).
 *
 * Pina o contrato APÓS o re-key da decisão A:
 *   - `pickNextInOrder` casa o cursor por `memberId` (NÃO mais por userId), pois
 *     userId é nullable desde M1 (vários NULL colidem).
 *   - `loadActivePool` seleciona whatsapp/name e mapeia displayName + userId nullable.
 *
 * `pickNextInOrder` é puro (sem mock). `loadActivePool` recebe um delegate
 * estrutural mockado (não toca DB real).
 */

import { describe, it, expect, vi } from 'vitest'

import {
  pickNextInOrder,
  loadActivePool,
  type RouletteCandidate,
} from './round-robin.service'

// ---------------------------------------------------------------------------
// pickNextInOrder — cursor por memberId
// ---------------------------------------------------------------------------

function cand(
  memberId: string,
  overrides: Partial<RouletteCandidate> = {},
): RouletteCandidate {
  return {
    memberId,
    userId: null,
    userName: 'Atendente',
    displayName: 'Atendente',
    whatsapp: null,
    position: 0,
    ...overrides,
  }
}

describe('pickNextInOrder — keyed by memberId', () => {
  it('retorna null para pool vazio', () => {
    expect(pickNextInOrder([], null)).toBeNull()
  })

  it('cursor null → primeiro membro', () => {
    const pool = [cand('m-1'), cand('m-2')]
    expect(pickNextInOrder(pool, null)?.memberId).toBe('m-1')
  })

  it('avança circular pelo memberId (não pelo userId)', () => {
    const pool = [cand('m-1'), cand('m-2'), cand('m-3')]
    expect(pickNextInOrder(pool, 'm-1')?.memberId).toBe('m-2')
    expect(pickNextInOrder(pool, 'm-2')?.memberId).toBe('m-3')
    // wrap-around
    expect(pickNextInOrder(pool, 'm-3')?.memberId).toBe('m-1')
  })

  it('DISTINGUE membros com o MESMO userId null (o bug que o re-key conserta)', () => {
    // Dois membros "nome + WhatsApp" sem userId — antes colidiam no cursor.
    const pool = [
      cand('m-1', { userId: null, whatsapp: '+5511900000001' }),
      cand('m-2', { userId: null, whatsapp: '+5511900000002' }),
    ]
    // Com o cursor em m-1, o próximo é m-2 (e não recomeça do topo por colisão).
    expect(pickNextInOrder(pool, 'm-1')?.memberId).toBe('m-2')
  })

  it('cursor desconhecido (membro saiu do pool) → recomeça do topo', () => {
    const pool = [cand('m-1'), cand('m-2')]
    expect(pickNextInOrder(pool, 'm-removido')?.memberId).toBe('m-1')
  })
})

// ---------------------------------------------------------------------------
// loadActivePool — select/map com whatsapp/name/displayName
// ---------------------------------------------------------------------------

describe('loadActivePool — mapeia whatsapp/name/displayName', () => {
  it('seleciona whatsapp e name e deriva displayName (user.name > name > Atendente)', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'm-1',
        userId: 'u-1',
        name: 'NomeMembro',
        whatsapp: '+5511988887777',
        position: 0,
        user: { name: 'NomeUsuario' },
      },
      {
        id: 'm-2',
        userId: null,
        name: 'SoNome',
        whatsapp: null,
        position: 1,
        user: null,
      },
      {
        id: 'm-3',
        userId: null,
        name: null,
        whatsapp: '+5511900000003',
        position: 2,
        user: null,
      },
    ])
    const db = { departmentMember: { findMany } } as never

    const pool = await loadActivePool(db, 'dept-1', 'org-1')

    expect(pool).toHaveLength(3)
    // user.name vence
    expect(pool[0]).toMatchObject({
      memberId: 'm-1',
      userId: 'u-1',
      displayName: 'NomeUsuario',
      whatsapp: '+5511988887777',
    })
    // member.name quando não há user
    expect(pool[1]).toMatchObject({
      memberId: 'm-2',
      userId: null,
      displayName: 'SoNome',
      whatsapp: null,
    })
    // fallback 'Atendente' quando nem user nem name
    expect(pool[2]).toMatchObject({ memberId: 'm-3', displayName: 'Atendente' })

    // o select pede whatsapp e name
    const selectArg = findMany.mock.calls[0]?.[0]?.select as Record<string, unknown>
    expect(selectArg.whatsapp).toBe(true)
    expect(selectArg.name).toBe(true)
  })

  it('retorna [] quando o delegate departmentMember está ausente (migration não landou)', async () => {
    const db = {} as never
    const pool = await loadActivePool(db, 'dept-1', 'org-1')
    expect(pool).toEqual([])
  })
})
