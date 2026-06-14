/**
 * enabled-tools-derivation — Vitest unit (FR-09/FR-10/FR-11, jornada-builder-v2).
 *
 * O que estes testes pinam (o CONTRATO da derivação determinística):
 *   1. reconcileEnabledTools é um SET-MERGE: preserva tools custom/desconhecidas
 *      e a ordem existente; NUNCA substitui o array inteiro; `changed=false`
 *      quando o resultado é idêntico (caller pula o UPDATE — idempotência).
 *   2. derivePricingToolChanges: itens ativos + style!=='none' → ensure
 *      get_pricing; 'none'/vazio → remove get_pricing E send_pricing (FR-10:
 *      "não falar preços" + tool de preços ativa = impossível).
 *   3. deriveHandoffToolChanges: solo/roleta/departamentos → ensure
 *      transfer_to_human (+create_lead com roteiro — o que o antigo
 *      qualified_handoff anexava); 'nenhum' → remove transfer_to_human (mas
 *      NUNCA create_lead — ortogonal/lead_only); ausente → neutro (FR-08 opt-in
 *      sem clobberar anexos manuais).
 *   4. deriveCalendarToolChanges: alsoSchedule+conexão → 4 tools reais (remove
 *      fallback); alsoSchedule sem conexão → fallback schedule_appointment
 *      (remove as 4 reais); sem alsoSchedule → remove todas (FR-11).
 *   5. hasActiveCalendarConnection (probe IO): espelha o escopo de
 *      resolveCalendarAccess (override do projeto OU org-level, isActive),
 *      fail-open para `false` em erro de leitura (NUNCA lança — NFR-06).
 *
 * Idioma de mock do repo (vi.hoisted + vi.mock + import after-mock), igual a
 * materialize-pricing.handler.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mock — database (só o probe usa IO)
// ---------------------------------------------------------------------------

const mockProviderFindFirst = vi.hoisted(() => vi.fn())

const databaseMock = vi.hoisted(() => ({
  organizationProvider: {
    findFirst: mockProviderFindFirst,
  },
}))

vi.mock('@/server/services/database', () => ({
  database: databaseMock,
  getDatabase: () => databaseMock,
}))

// ---------------------------------------------------------------------------
// SUT — após o vi.mock
// ---------------------------------------------------------------------------

import {
  CALENDAR_TOOL_KEYS,
  SCHEDULE_FALLBACK_TOOL_KEY,
  PROACTIVE_FOLLOWUP_TOOL_KEY,
  deriveCalendarToolChanges,
  deriveHandoffToolChanges,
  derivePricingToolChanges,
  deriveProactiveToolChanges,
  hasActiveCalendarConnection,
  reconcileEnabledTools,
} from './enabled-tools-derivation'

beforeEach(() => {
  vi.clearAllMocks()
  mockProviderFindFirst.mockResolvedValue(null)
})

// ---------------------------------------------------------------------------
// reconcileEnabledTools (set-merge puro)
// ---------------------------------------------------------------------------

describe('reconcileEnabledTools — set-merge que preserva tools custom', () => {
  it('faz append das keys ensure ausentes, ao final, sem duplicar', () => {
    const plan = reconcileEnabledTools(['search_knowledge'], [
      { ensure: ['get_pricing', 'search_knowledge'], remove: [] },
    ])
    expect(plan.next).toEqual(['search_knowledge', 'get_pricing'])
    expect(plan.changed).toBe(true)
  })

  it('remove APENAS as keys listadas — entradas custom/desconhecidas ficam intactas e em ordem', () => {
    const plan = reconcileEnabledTools(
      ['minha_tool_custom', 'get_pricing', 'webhook_crm', 'send_pricing'],
      [{ ensure: [], remove: ['get_pricing', 'send_pricing'] }],
    )
    expect(plan.next).toEqual(['minha_tool_custom', 'webhook_crm'])
    expect(plan.changed).toBe(true)
  })

  it('changed=false quando nada muda (ensure já presente, remove já ausente) — caller pula o UPDATE', () => {
    const plan = reconcileEnabledTools(['transfer_to_human', 'custom_x'], [
      { ensure: ['transfer_to_human'], remove: ['get_pricing'] },
    ])
    expect(plan.changed).toBe(false)
    expect(plan.next).toEqual(['transfer_to_human', 'custom_x'])
  })

  it('mescla múltiplas changes e ensure VENCE remove em conflito (defensivo)', () => {
    const plan = reconcileEnabledTools([], [
      { ensure: ['transfer_to_human'], remove: [] },
      { ensure: [], remove: ['transfer_to_human', 'schedule_appointment'] },
    ])
    expect(plan.next).toEqual(['transfer_to_human'])
  })

  it('aceita current null/undefined como array vazio (defensivo)', () => {
    expect(reconcileEnabledTools(undefined, [{ ensure: ['a'], remove: [] }]).next).toEqual(['a'])
    expect(reconcileEnabledTools(null, []).changed).toBe(false)
  })

  it('não muta o array de entrada (puro)', () => {
    const current = ['a', 'b']
    reconcileEnabledTools(current, [{ ensure: ['c'], remove: ['a'] }])
    expect(current).toEqual(['a', 'b'])
  })
})

// ---------------------------------------------------------------------------
// derivePricingToolChanges
// ---------------------------------------------------------------------------

describe('derivePricingToolChanges — FR-10 (preços)', () => {
  it("itens ativos + style!=='none' → ensure get_pricing (não toca send_pricing)", () => {
    const change = derivePricingToolChanges({ activeItemCount: 3, disclosureStyle: 'exact' })
    expect(change.ensure).toEqual(['get_pricing'])
    expect(change.remove).toEqual([])
  })

  it("style==='none' → remove get_pricing E send_pricing mesmo com itens", () => {
    const change = derivePricingToolChanges({ activeItemCount: 3, disclosureStyle: 'none' })
    expect(change.ensure).toEqual([])
    expect(change.remove).toEqual(['get_pricing', 'send_pricing'])
  })

  it('lista vazia → remove get_pricing E send_pricing mesmo com style falante', () => {
    const change = derivePricingToolChanges({ activeItemCount: 0, disclosureStyle: 'from' })
    expect(change.remove).toEqual(['get_pricing', 'send_pricing'])
  })
})

// ---------------------------------------------------------------------------
// deriveHandoffToolChanges
// ---------------------------------------------------------------------------

describe('deriveHandoffToolChanges — FR-08/FR-10 (handoff)', () => {
  it("modo 'roleta' → ensure transfer_to_human", () => {
    const change = deriveHandoffToolChanges({ mode: 'roleta', steps: [] })
    expect(change.ensure).toEqual(['transfer_to_human'])
    expect(change.remove).toEqual([])
  })

  it("modo 'solo' com roteiro de qualificação → ensure transfer_to_human + create_lead (o antigo qualified_handoff)", () => {
    const change = deriveHandoffToolChanges({
      mode: 'solo',
      steps: ['Qual seu nome?', 'Qual o orçamento?'],
    })
    expect(change.ensure).toEqual(['transfer_to_human', 'create_lead'])
  })

  it("modo 'departamentos' sem roteiro → só transfer_to_human", () => {
    const change = deriveHandoffToolChanges({ mode: 'departamentos', steps: [] })
    expect(change.ensure).toEqual(['transfer_to_human'])
  })

  it("modo 'nenhum' → remove transfer_to_human mas NUNCA create_lead (ortogonal/lead_only)", () => {
    const change = deriveHandoffToolChanges({ mode: 'nenhum', steps: ['Pergunta'] })
    expect(change.ensure).toEqual([])
    expect(change.remove).toEqual(['transfer_to_human'])
    expect(change.remove).not.toContain('create_lead')
  })

  it('modo AUSENTE → neutro (não anexa — opt-in FR-08 — nem remove anexos manuais/legados)', () => {
    const change = deriveHandoffToolChanges({ mode: undefined, steps: [] })
    expect(change.ensure).toEqual([])
    expect(change.remove).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// deriveCalendarToolChanges
// ---------------------------------------------------------------------------

describe('deriveCalendarToolChanges — FR-11 (agenda)', () => {
  it('alsoSchedule + conexão ATIVA → ensure as 4 tools reais e remove o fallback', () => {
    const change = deriveCalendarToolChanges({ alsoSchedule: true, hasActiveConnection: true })
    expect(change.ensure).toEqual([
      'check_availability',
      'create_event',
      'cancel_event',
      'calendar_list_slots',
    ])
    expect(change.remove).toEqual([SCHEDULE_FALLBACK_TOOL_KEY])
  })

  it('alsoSchedule SEM conexão → ensure schedule_appointment (fallback) e remove as 4 reais', () => {
    const change = deriveCalendarToolChanges({ alsoSchedule: true, hasActiveConnection: false })
    expect(change.ensure).toEqual([SCHEDULE_FALLBACK_TOOL_KEY])
    expect(change.remove).toEqual([...CALENDAR_TOOL_KEYS])
  })

  it('sem alsoSchedule → remove TODAS (4 reais + fallback)', () => {
    const change = deriveCalendarToolChanges({ alsoSchedule: false, hasActiveConnection: true })
    expect(change.ensure).toEqual([])
    expect(change.remove).toEqual([...CALENDAR_TOOL_KEYS, SCHEDULE_FALLBACK_TOOL_KEY])
  })
})

// ---------------------------------------------------------------------------
// deriveProactiveToolChanges
// ---------------------------------------------------------------------------

describe('deriveProactiveToolChanges — FR-PRO-01 (follow-up proativo)', () => {
  it('followUp:true → ensure create_followup (sem remover nada)', () => {
    const change = deriveProactiveToolChanges({
      followUp: true,
      reminders: false,
      importantDates: false,
    })
    expect(change.ensure).toEqual([PROACTIVE_FOLLOWUP_TOOL_KEY])
    expect(change.remove).toEqual([])
  })

  it('followUp:false → remove create_followup (não publica por acidente)', () => {
    const change = deriveProactiveToolChanges({
      followUp: false,
      reminders: true,
      importantDates: true,
    })
    expect(change.ensure).toEqual([])
    expect(change.remove).toEqual([PROACTIVE_FOLLOWUP_TOOL_KEY])
  })

  it('proactive undefined (capacidade nunca configurada) → remove create_followup', () => {
    const change = deriveProactiveToolChanges(undefined)
    expect(change.ensure).toEqual([])
    expect(change.remove).toEqual([PROACTIVE_FOLLOWUP_TOOL_KEY])
  })

  it('só followUp gateia a tool: reminders/importantDates ON mas followUp OFF → remove', () => {
    const change = deriveProactiveToolChanges({
      followUp: false,
      reminders: true,
      importantDates: false,
    })
    expect(change.ensure).toEqual([])
    expect(change.remove).toEqual([PROACTIVE_FOLLOWUP_TOOL_KEY])
  })

  it('set-merge preserva tools custom: followUp ON anexa create_followup ao final', () => {
    const plan = reconcileEnabledTools(['minha_tool_custom', 'transfer_to_human'], [
      deriveProactiveToolChanges({ followUp: true, reminders: false, importantDates: false }),
    ])
    expect(plan.next).toEqual([
      'minha_tool_custom',
      'transfer_to_human',
      PROACTIVE_FOLLOWUP_TOOL_KEY,
    ])
  })

  it('set-merge remove APENAS create_followup quando followUp OFF — custom intactas', () => {
    const plan = reconcileEnabledTools(['create_followup', 'webhook_crm'], [
      deriveProactiveToolChanges({ followUp: false, reminders: false, importantDates: false }),
    ])
    expect(plan.next).toEqual(['webhook_crm'])
  })
})

// ---------------------------------------------------------------------------
// hasActiveCalendarConnection (probe IO, fail-open)
// ---------------------------------------------------------------------------

describe('hasActiveCalendarConnection — probe espelhando resolveCalendarAccess', () => {
  it('true quando existe OrganizationProvider google-calendar ativo (org/projeto)', async () => {
    mockProviderFindFirst.mockResolvedValue({ id: 'prov-1' })
    await expect(hasActiveCalendarConnection('org-1', 'proj-1')).resolves.toBe(true)
  })

  it('false quando não há credencial', async () => {
    mockProviderFindFirst.mockResolvedValue(null)
    await expect(hasActiveCalendarConnection('org-1', 'proj-1')).resolves.toBe(false)
  })

  it('escopa por org + provider google-calendar + isActive + (override do projeto OU org-level)', async () => {
    await hasActiveCalendarConnection('org-1', 'proj-1')
    const arg = mockProviderFindFirst.mock.calls[0]?.[0] as {
      where: {
        organizationId: string
        provider: string
        isActive: boolean
        OR: Array<{ builderProjectId: string | null }>
      }
    }
    expect(arg.where.organizationId).toBe('org-1')
    expect(arg.where.provider).toBe('google-calendar')
    expect(arg.where.isActive).toBe(true)
    expect(arg.where.OR).toEqual([
      { builderProjectId: 'proj-1' },
      { builderProjectId: null },
    ])
  })

  it('FAIL-OPEN: erro de leitura degrada para false (nunca lança) — deploy segue com o fallback', async () => {
    mockProviderFindFirst.mockRejectedValue(new Error('db down'))
    await expect(hasActiveCalendarConnection('org-1', 'proj-1')).resolves.toBe(false)
  })
})
