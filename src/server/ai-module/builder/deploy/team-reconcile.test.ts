/**
 * team-reconcile — Vitest unit (M1, helper PURO de reconciliação do TEAM).
 *
 * Espelha `pricing-reconcile.test.ts`: pina o CONTRATO do helper sem DB.
 *
 * O que estes testes pinam:
 *   1. `sanitizeTeamMembersForRuntime`: trim, normalização de WhatsApp E.164-BR,
 *      descarte de linhas sem identidade, `position` reescrita pela ORDEM, dedupe
 *      por chave (last-write-wins).
 *   2. `reconcileTeamMembers` — match-by-key 3 níveis (userId > whatsapp > nome):
 *        - presente no state E no DB     → toUpdate (carimba id)
 *        - presente no state, ausente DB → toCreate
 *        - ausente no state, presente DB → toDeactivate (NUNCA hard-delete)
 *   3. Dedupe do DB: duplicatas históricas da mesma chave → 1 alvo + resto desativa.
 *   4. Idempotência: rodar 2x converge ao mesmo estado.
 *
 * Função pura (zero IO): nada é mockado.
 */

import { describe, it, expect } from 'vitest'

import type { TeamMember } from '../cards/builder-state'
import {
  sanitizeTeamMembersForRuntime,
  reconcileTeamMembers,
  type ExistingMember,
  type NormalizedMember,
} from './team-reconcile'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return { position: 0, ...overrides }
}

function existing(overrides: Partial<ExistingMember> = {}): ExistingMember {
  return { id: 'm-1', userId: null, whatsapp: null, name: null, ...overrides }
}

// ---------------------------------------------------------------------------
// sanitizeTeamMembersForRuntime
// ---------------------------------------------------------------------------

describe('sanitizeTeamMembersForRuntime', () => {
  it('trima nome/userId e normaliza o WhatsApp para E.164-BR', () => {
    const out = sanitizeTeamMembersForRuntime([
      member({ name: '  Ana  ', whatsapp: '(11) 98888-7777' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Ana')
    expect(out[0].whatsapp).toBe('+5511988887777')
  })

  it('descarta uma linha SEM identidade (sem userId, whatsapp e nome)', () => {
    const out = sanitizeTeamMembersForRuntime([
      member({ name: '   ', whatsapp: '', userId: '' }),
    ])
    expect(out).toHaveLength(0)
  })

  it('reescreve position pela ORDEM dos sobreviventes (0..N), ignorando o JSONB', () => {
    const out = sanitizeTeamMembersForRuntime([
      member({ name: 'A', position: 99 }),
      member({ name: '   ' }), // descartado — não deve deixar buraco
      member({ name: 'B', position: 5 }),
    ])
    expect(out.map((m) => [m.name, m.position])).toEqual([
      ['A', 0],
      ['B', 1],
    ])
  })

  it('mantém ambas as linhas no sanitize (a dedupe por chave acontece no reconcile, last-write-wins)', () => {
    // `sanitizeTeamMembersForRuntime` é só normalização (espelha o pricing): NÃO
    // dedupa. A colisão por chave (mesmo whatsapp) é resolvida em
    // `reconcileTeamMembers` via desiredByKey (último vence) — testado abaixo.
    const sanitized = sanitizeTeamMembersForRuntime([
      member({ name: 'Antigo', whatsapp: '11988887777' }),
      member({ name: 'Novo', whatsapp: '11988887777' }),
    ])
    expect(sanitized).toHaveLength(2)

    // No reconcile, a chave `w:+5511988887777` colapsa para o ÚLTIMO (Novo).
    const plan = reconcileTeamMembers([], sanitized)
    expect(plan.toCreate).toHaveLength(1)
    expect(plan.toCreate[0].name).toBe('Novo')
  })

  it('whatsapp inválido vira null (membro só-nome ainda é válido)', () => {
    const out = sanitizeTeamMembersForRuntime([
      member({ name: 'Bia', whatsapp: '123' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].whatsapp).toBeNull()
    expect(out[0].name).toBe('Bia')
  })

  it('F0 — connectionId flui (string) e vira null quando ausente/em branco', () => {
    const withConn = sanitizeTeamMembersForRuntime([
      member({ name: 'João', connectionId: 'conn-123' }),
    ])
    expect(withConn[0].connectionId).toBe('conn-123')

    const without = sanitizeTeamMembersForRuntime([member({ name: 'Ana' })])
    expect(without[0].connectionId).toBeNull()

    const blank = sanitizeTeamMembersForRuntime([
      member({ name: 'Bia', connectionId: '   ' }),
    ])
    expect(blank[0].connectionId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// reconcileTeamMembers
// ---------------------------------------------------------------------------

describe('reconcileTeamMembers', () => {
  it('CREATE quando o membro está no desired e ausente no DB', () => {
    const desired: NormalizedMember[] = [
      { userId: 'u-1', name: 'Ana', whatsapp: null, connectionId: null, position: 0 },
    ]
    const plan = reconcileTeamMembers([], desired)
    expect(plan.toCreate).toHaveLength(1)
    expect(plan.toUpdate).toHaveLength(0)
    expect(plan.toDeactivate).toHaveLength(0)
  })

  it('UPDATE (não CREATE) quando casa por userId', () => {
    const plan = reconcileTeamMembers(
      [existing({ id: 'm-1', userId: 'u-1', name: 'Velho' })],
      [{ userId: 'u-1', name: 'Novo', whatsapp: null, connectionId: null, position: 0 }],
    )
    expect(plan.toCreate).toHaveLength(0)
    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toUpdate[0].id).toBe('m-1')
    expect(plan.toUpdate[0].name).toBe('Novo')
  })

  it('casa por whatsapp quando não há userId (nível 2)', () => {
    const plan = reconcileTeamMembers(
      [existing({ id: 'm-2', whatsapp: '+5511988887777', name: 'Bia' })],
      [{ userId: null, name: 'Bia', whatsapp: '+5511988887777', connectionId: null, position: 0 }],
    )
    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toUpdate[0].id).toBe('m-2')
  })

  it('casa o whatsapp do DB mesmo em formato diferente (normaliza ambos os lados)', () => {
    const plan = reconcileTeamMembers(
      [existing({ id: 'm-2', whatsapp: '11988887777' })], // sem +55
      [{ userId: null, name: null, whatsapp: '+5511988887777', connectionId: null, position: 0 }],
    )
    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toUpdate[0].id).toBe('m-2')
    expect(plan.toCreate).toHaveLength(0)
  })

  it('casa por nome quando não há userId nem whatsapp (nível 3, case-insensitive)', () => {
    const plan = reconcileTeamMembers(
      [existing({ id: 'm-3', name: 'CARLOS' })],
      [{ userId: null, name: 'carlos', whatsapp: null, connectionId: null, position: 0 }],
    )
    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toUpdate[0].id).toBe('m-3')
  })

  it('DESATIVA (toDeactivate) o membro do DB ausente no desired — NUNCA hard-delete', () => {
    const plan = reconcileTeamMembers(
      [
        existing({ id: 'm-fica', userId: 'u-1' }),
        existing({ id: 'm-some', userId: 'u-2' }),
      ],
      [{ userId: 'u-1', name: 'Ana', whatsapp: null, connectionId: null, position: 0 }],
    )
    expect(plan.toUpdate.map((u) => u.id)).toEqual(['m-fica'])
    expect(plan.toDeactivate).toContain('m-some')
  })

  it('duplicatas do DB com a MESMA chave: 1 alvo + o resto desativa (converge em 1 run)', () => {
    const plan = reconcileTeamMembers(
      [
        existing({ id: 'm-a', userId: 'u-1' }),
        existing({ id: 'm-b', userId: 'u-1' }), // duplicata
      ],
      [{ userId: 'u-1', name: 'Ana', whatsapp: null, connectionId: null, position: 0 }],
    )
    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toUpdate[0].id).toBe('m-a')
    expect(plan.toDeactivate).toContain('m-b')
  })

  it('linha do DB SEM identidade utilizável vai para toDeactivate (lixo legado)', () => {
    const plan = reconcileTeamMembers(
      [existing({ id: 'm-lixo', userId: null, whatsapp: null, name: null })],
      [],
    )
    expect(plan.toDeactivate).toContain('m-lixo')
  })

  it('idempotência: rodar 2x com o MESMO DB resultante não cria duplicata', () => {
    const desired: NormalizedMember[] = [
      { userId: 'u-1', name: 'Ana', whatsapp: null, connectionId: null, position: 0 },
    ]
    // 1ª run — DB vazio → create.
    const first = reconcileTeamMembers([], desired)
    expect(first.toCreate).toHaveLength(1)

    // 2ª run — DB já tem o membro → update no-op, sem create/deactivate.
    const second = reconcileTeamMembers(
      [existing({ id: 'm-1', userId: 'u-1', name: 'Ana' })],
      desired,
    )
    expect(second.toCreate).toHaveLength(0)
    expect(second.toDeactivate).toHaveLength(0)
    expect(second.toUpdate).toHaveLength(1)
  })
})
