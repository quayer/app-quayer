/**
 * model-router.service — unit tests (QH-05)
 *
 * Cobre:
 *   modelForTurn:
 *     1. Sem miniModel → tier full (roteamento desligado)
 *     2. miniModel null explícito → tier full (roteamento desligado)
 *     3. previousTools undefined → tier full (primeiro turno)
 *     4. previousTools vazio, sem tool pesada → tier mini
 *     5. Tool pesada exata (transfer_to_human) → tier full
 *     6. Tool pesada exata (dispatch_to_agent) → tier full
 *     7. Tool pesada exata (create_lead) → tier full
 *     8. Tool pesada exata (create_event) → tier full
 *     9. Tool pesada exata (check_availability) → tier full
 *    10. Tool pesada exata (get_pricing) → tier full
 *    11. Tool pesada exata (send_pricing) → tier full
 *    12. Prefixo calendar* → tier full
 *    13. Mix de tools baratas + 1 pesada → tier full
 *    14. Múltiplas tools, todas baratas → tier mini
 *    15. Input Zod inválido → fail-safe tier full
 *    16. reason inclui nome da tool pesada encontrada
 *    17. Resultado de mini contém provider/model do miniModel
 *    18. Resultado de full contém provider/model do fullModel
 *
 *   parseMiniModelEnv:
 *    19. Formato válido "provider:model" → objeto correto
 *    20. Modelo com ":" no nome (ex: "openai:gpt-4o:2025-01") → split no primeiro ":"
 *    21. undefined → null
 *    22. string vazia → null
 *    23. string sem ":" → null
 *    24. ":" inicial (provider vazio) → null
 *    25. "provider:" (model vazio) → null
 */

import { describe, it, expect } from 'vitest'
import { modelForTurn, parseMiniModelEnv } from './model-router.service'

// ── Fixtures ───────────────────────────────────────────────────────────────────

const FULL_MODEL = { provider: 'openai', model: 'gpt-4o' }
const MINI_MODEL = { provider: 'openai', model: 'gpt-4o-mini' }

// ── modelForTurn ───────────────────────────────────────────────────────────────

describe('modelForTurn', () => {
  describe('roteamento desligado (sem miniModel)', () => {
    it('miniModel ausente (undefined) → tier full, routing_disabled', () => {
      const result = modelForTurn({
        previousTools: [],
        fullModel: FULL_MODEL,
      })

      expect(result.tier).toBe('full')
      expect(result.provider).toBe('openai')
      expect(result.model).toBe('gpt-4o')
      expect(result.reason).toBe('routing_disabled_no_mini_model')
    })

    it('miniModel null explícito → tier full, routing_disabled', () => {
      const result = modelForTurn({
        previousTools: ['greet_user'],
        fullModel: FULL_MODEL,
        miniModel: null,
      })

      expect(result.tier).toBe('full')
      expect(result.reason).toBe('routing_disabled_no_mini_model')
    })
  })

  describe('primeiro turno (previousTools undefined)', () => {
    it('previousTools undefined → tier full, first_turn', () => {
      const result = modelForTurn({
        previousTools: undefined,
        fullModel: FULL_MODEL,
        miniModel: MINI_MODEL,
      })

      expect(result.tier).toBe('full')
      expect(result.reason).toBe('first_turn_no_previous_tools')
      expect(result.provider).toBe('openai')
      expect(result.model).toBe('gpt-4o')
    })
  })

  describe('turno de small-talk → mini', () => {
    it('previousTools vazio → tier mini', () => {
      const result = modelForTurn({
        previousTools: [],
        fullModel: FULL_MODEL,
        miniModel: MINI_MODEL,
      })

      expect(result.tier).toBe('mini')
      expect(result.provider).toBe('openai')
      expect(result.model).toBe('gpt-4o-mini')
      expect(result.reason).toBe('lightweight_turn_use_mini')
    })

    it('previousTools com tools baratas → tier mini', () => {
      const result = modelForTurn({
        previousTools: ['greet_user', 'qualify_lead', 'send_message'],
        fullModel: FULL_MODEL,
        miniModel: MINI_MODEL,
      })

      expect(result.tier).toBe('mini')
    })

    it('miniModel de provider diferente é respeitado', () => {
      const anthropicMini = { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' }
      const result = modelForTurn({
        previousTools: [],
        fullModel: FULL_MODEL,
        miniModel: anthropicMini,
      })

      expect(result.tier).toBe('mini')
      expect(result.provider).toBe('anthropic')
      expect(result.model).toBe('claude-haiku-3-5-20241022')
    })
  })

  describe('tools pesadas exatas → full', () => {
    const heavyTools = [
      'transfer_to_human',
      'dispatch_to_agent',
      'create_lead',
      'create_event',
      'check_availability',
      'get_pricing',
      'send_pricing',
    ]

    for (const tool of heavyTools) {
      it(`tool "${tool}" → tier full`, () => {
        const result = modelForTurn({
          previousTools: [tool],
          fullModel: FULL_MODEL,
          miniModel: MINI_MODEL,
        })

        expect(result.tier).toBe('full')
        expect(result.reason).toContain(tool)
        expect(result.provider).toBe('openai')
        expect(result.model).toBe('gpt-4o')
      })
    }
  })

  describe('prefixo calendar* → full', () => {
    it('calendar_create_event → tier full', () => {
      const result = modelForTurn({
        previousTools: ['calendar_create_event'],
        fullModel: FULL_MODEL,
        miniModel: MINI_MODEL,
      })

      expect(result.tier).toBe('full')
      expect(result.reason).toContain('calendar_create_event')
    })

    it('calendar_list_events → tier full', () => {
      const result = modelForTurn({
        previousTools: ['calendar_list_events'],
        fullModel: FULL_MODEL,
        miniModel: MINI_MODEL,
      })

      expect(result.tier).toBe('full')
    })
  })

  describe('mix de tools', () => {
    it('tools baratas + 1 pesada → tier full (pesada domina)', () => {
      const result = modelForTurn({
        previousTools: ['greet_user', 'transfer_to_human', 'send_message'],
        fullModel: FULL_MODEL,
        miniModel: MINI_MODEL,
      })

      expect(result.tier).toBe('full')
      expect(result.reason).toContain('transfer_to_human')
    })

    it('múltiplas tools, todas baratas → tier mini', () => {
      const result = modelForTurn({
        previousTools: ['greet_user', 'qualify_lead', 'ask_name', 'ask_email'],
        fullModel: FULL_MODEL,
        miniModel: MINI_MODEL,
      })

      expect(result.tier).toBe('mini')
    })
  })

  describe('fail-safe em input inválido', () => {
    it('fullModel inválido (provider vazio) → tier full (fail-safe)', () => {
      // Forçar runtime inválido sem romper tipos: cast via unknown
      const badInput = {
        previousTools: [],
        fullModel: { provider: '', model: 'gpt-4o' },
        miniModel: MINI_MODEL,
      } as unknown as Parameters<typeof modelForTurn>[0]

      const result = modelForTurn(badInput)

      expect(result.tier).toBe('full')
      expect(result.reason).toBe('invalid_input_fallback_full')
    })
  })

  describe('campos do resultado', () => {
    it('tier mini → resultado contém campos do miniModel', () => {
      const result = modelForTurn({
        previousTools: [],
        fullModel: FULL_MODEL,
        miniModel: MINI_MODEL,
      })

      expect(result).toMatchObject({
        provider: MINI_MODEL.provider,
        model: MINI_MODEL.model,
        tier: 'mini',
        reason: expect.any(String),
      })
    })

    it('tier full → resultado contém campos do fullModel', () => {
      const result = modelForTurn({
        previousTools: undefined,
        fullModel: FULL_MODEL,
        miniModel: MINI_MODEL,
      })

      expect(result).toMatchObject({
        provider: FULL_MODEL.provider,
        model: FULL_MODEL.model,
        tier: 'full',
        reason: expect.any(String),
      })
    })
  })
})

// ── parseMiniModelEnv ──────────────────────────────────────────────────────────

describe('parseMiniModelEnv', () => {
  it('formato válido "provider:model" → objeto correto', () => {
    expect(parseMiniModelEnv('openai:gpt-4o-mini')).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
    })
  })

  it('anthropic com versão no modelo', () => {
    expect(parseMiniModelEnv('anthropic:claude-haiku-3-5-20241022')).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-3-5-20241022',
    })
  })

  it('split ocorre apenas no PRIMEIRO ":" (modelo pode conter ":")', () => {
    // Ex.: se alguém colocar versão explícita tipo "openai:gpt-4o:2025-01"
    // provider = "openai", model = "gpt-4o:2025-01"
    expect(parseMiniModelEnv('openai:gpt-4o:2025-01')).toEqual({
      provider: 'openai',
      model: 'gpt-4o:2025-01',
    })
  })

  it('undefined → null', () => {
    expect(parseMiniModelEnv(undefined)).toBeNull()
  })

  it('string vazia → null', () => {
    expect(parseMiniModelEnv('')).toBeNull()
  })

  it('string só com espaços → null', () => {
    expect(parseMiniModelEnv('   ')).toBeNull()
  })

  it('sem ":" → null', () => {
    expect(parseMiniModelEnv('openaigpt4omini')).toBeNull()
  })

  it('":" inicial (provider vazio) → null', () => {
    expect(parseMiniModelEnv(':gpt-4o-mini')).toBeNull()
  })

  it('"provider:" (model vazio) → null', () => {
    expect(parseMiniModelEnv('openai:')).toBeNull()
  })
})
