/**
 * Tests for the PLAYBOOK ENGINE library + resolver (#6 / FR-40):
 * `AGENT_STRATEGIES`, `resolveAgentStrategy`, `assertStrategiesUseOfficialTools`.
 *
 * Hermetic: pure design-time module — no DB, no mocks, no IO.
 *
 * Covers:
 *   - resolve por role + nicho conhecido (casamento exato);
 *   - fallback genérico para role/negócio desconhecidos, SEM throw;
 *   - resolve por objetivo quando o role não vem explícito;
 *   - nicho→businessType reusa niche-inference (delivery→ecommerce, B2B→saas,
 *     imobiliário→imobiliario, saúde→clinica);
 *   - TODO recommendedTools ∈ OFFICIAL_TOOLS (catálogo é a lei — FR-51);
 *   - frameworks são apenas os valores INTERNOS permitidos.
 */

import { describe, it, expect } from 'vitest'
import { OFFICIAL_TOOLS } from '../catalog/official-tools'
import {
  AGENT_STRATEGIES,
  assertStrategiesUseOfficialTools,
  resolveAgentStrategy,
  type AgentStrategyFramework,
} from './agent-strategy'

const OFFICIAL_NAMES = new Set(OFFICIAL_TOOLS.map((t) => t.name))

const INTERNAL_FRAMEWORKS: ReadonlySet<AgentStrategyFramework> = new Set([
  'bant_lite',
  'spin',
  'meddic',
  'triage',
  'appointment',
])

describe('AGENT_STRATEGIES (biblioteca curada)', () => {
  it('tem ~6-8 estratégias reais', () => {
    expect(AGENT_STRATEGIES.length).toBeGreaterThanOrEqual(6)
    expect(AGENT_STRATEGIES.length).toBeLessThanOrEqual(10)
  })

  it('todo recommendedTools existe em OFFICIAL_TOOLS (catálogo é a lei — FR-51)', () => {
    for (const strategy of AGENT_STRATEGIES) {
      for (const toolId of strategy.recommendedTools) {
        expect(
          OFFICIAL_NAMES.has(toolId),
          `${strategy.role}/${strategy.businessType} usa tool inválida "${toolId}"`,
        ).toBe(true)
      }
    }
  })

  it('guard assertStrategiesUseOfficialTools não encontra offenders', () => {
    expect(assertStrategiesUseOfficialTools()).toEqual([])
  })

  it('frameworks são apenas valores INTERNOS permitidos (nunca expostos na UI)', () => {
    for (const strategy of AGENT_STRATEGIES) {
      expect(INTERNAL_FRAMEWORKS.has(strategy.framework)).toBe(true)
    }
  })

  it('campos de negócio nunca vazios', () => {
    for (const strategy of AGENT_STRATEGIES) {
      expect(strategy.requiredFields.length).toBeGreaterThan(0)
      expect(strategy.recommendedTools.length).toBeGreaterThan(0)
      expect(strategy.guardrails.length).toBeGreaterThan(0)
      expect(strategy.handoffSummary.length).toBeGreaterThan(0)
      expect(strategy.successCriteria.length).toBeGreaterThan(0)
    }
  })

  it('quase toda estratégia comercial/atendimento sabe cair em humano', () => {
    for (const strategy of AGENT_STRATEGIES) {
      expect(strategy.recommendedTools).toContain('transfer_to_human')
    }
  })
})

describe('resolveAgentStrategy', () => {
  it('resolve SDR imobiliário por role + nicho conhecido (casamento exato)', () => {
    const strategy = resolveAgentStrategy({ role: 'sdr', niche: 'imobiliário' })
    expect(strategy.role).toBe('sdr')
    expect(strategy.businessType).toBe('imobiliario')
    expect(strategy.recommendedTools).toContain('create_lead')
    expect(strategy.recommendedTools).toContain('calendar_list_slots')
    expect(strategy.recommendedTools).toContain('check_availability')
    expect(strategy.recommendedTools).toContain('create_event')
  })

  it('reconhece objetivo livre de SDR para empredimento imob', () => {
    const strategy = resolveAgentStrategy({
      objective: 'Quero criar um SDR para empredimento imob',
      niche: 'empredimento imob',
    })
    expect(strategy.role).toBe('sdr')
    expect(strategy.businessType).toBe('imobiliario')
    expect(strategy.recommendedTools).toContain('calendar_list_slots')
  })

  it('resolve secretária de clínica (nicho saúde → clinica) com tools de agenda', () => {
    const strategy = resolveAgentStrategy({
      role: 'secretaria',
      niche: 'clínica odontológica',
    })
    expect(strategy.role).toBe('secretaria')
    expect(strategy.businessType).toBe('clinica')
    expect(strategy.recommendedTools).toContain('check_availability')
    expect(strategy.recommendedTools).toContain('create_event')
  })

  it('mapeia delivery → ecommerce e B2B → saas via niche-inference', () => {
    const vendas = resolveAgentStrategy({
      role: 'vendas',
      niche: 'restaurante delivery de pizza',
    })
    expect(vendas.businessType).toBe('ecommerce')

    const sdrB2b = resolveAgentStrategy({
      role: 'sdr',
      niche: 'software B2B / CRM',
    })
    expect(sdrB2b.businessType).toBe('saas')
  })

  it('fallback genérico para role e negócio desconhecidos (sem throw)', () => {
    expect(() =>
      resolveAgentStrategy({ role: 'xyz-desconhecido', niche: 'algo aleatório' }),
    ).not.toThrow()
    const strategy = resolveAgentStrategy({
      role: 'xyz-desconhecido',
      niche: 'algo aleatório',
    })
    expect(strategy.role).toBe('sdr')
    expect(strategy.businessType).toBe('generico')
    expect(strategy.recommendedTools).toContain('transfer_to_human')
  })

  it('input totalmente vazio retorna fallback sem lançar', () => {
    expect(() => resolveAgentStrategy({})).not.toThrow()
    const strategy = resolveAgentStrategy({})
    expect(strategy.recommendedTools.every((t) => OFFICIAL_NAMES.has(t))).toBe(
      true,
    )
  })

  it('infere role pelo objetivo quando role não vem (agendar → secretaria)', () => {
    const strategy = resolveAgentStrategy({
      objective: 'agendar',
      niche: 'clínica',
    })
    expect(strategy.role).toBe('secretaria')
  })

  it('role conhecida sem negócio casado cai na estratégia genérica da role', () => {
    const strategy = resolveAgentStrategy({
      role: 'cobranca',
      niche: 'nicho qualquer não mapeado',
    })
    expect(strategy.role).toBe('cobranca')
    expect(strategy.recommendedTools).toContain('transfer_to_human')
  })

  it('toda strategy resolvida usa apenas tools do catálogo', () => {
    const inputs = [
      { role: 'sdr', niche: 'imobiliário' },
      { role: 'closer' },
      { role: 'suporte', niche: 'saas' },
      { role: 'onboarding' },
      { objective: 'vender', niche: 'loja online' },
      {},
    ]
    for (const input of inputs) {
      const strategy = resolveAgentStrategy(input)
      for (const toolId of strategy.recommendedTools) {
        expect(OFFICIAL_NAMES.has(toolId)).toBe(true)
      }
    }
  })
})
