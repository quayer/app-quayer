/**
 * config-hash.service — unit tests (QH-11)
 *
 * Cobre:
 *   computeConfigHash:
 *     1. Mesmo input → mesmo hash (estabilidade)
 *     2. Ordem das tools não altera o hash (normalização)
 *     3. systemPrompt diferente → hash diferente
 *     4. provider diferente → hash diferente
 *     5. model diferente → hash diferente
 *     6. tools diferentes (item adicionado) → hash diferente
 *     7. temperature diferente → hash diferente
 *     8. maxTokens diferente → hash diferente
 *     9. temperature ausente vs presente → hash diferente
 *    10. maxTokens ausente vs presente → hash diferente
 *    11. Resultado é hex de 64 caracteres (SHA-256)
 *    12. Input com tools vazio → hash estável
 *    13. Input inválido (provider vazio) → lança ZodError
 *    14. Input inválido (model vazio) → lança ZodError
 */

import { describe, it, expect } from 'vitest'
import { computeConfigHash } from './config-hash.service'
import type { ComputeConfigHashInput } from './config-hash.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE: ComputeConfigHashInput = {
  systemPrompt: 'Você é um assistente prestativo.',
  tools: ['send_message', 'create_lead', 'get_pricing'],
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 1024,
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('computeConfigHash', () => {
  describe('estabilidade — mesmo input ⇒ mesmo hash', () => {
    it('chamadas consecutivas com o mesmo objeto retornam hash idêntico', () => {
      expect(computeConfigHash(BASE)).toBe(computeConfigHash(BASE))
    })

    it('cópia com mesmos valores retorna hash idêntico', () => {
      const copy: ComputeConfigHashInput = { ...BASE, tools: [...BASE.tools] }
      expect(computeConfigHash(copy)).toBe(computeConfigHash(BASE))
    })
  })

  describe('normalização de tools — ordem não importa', () => {
    it('permutações das mesmas tools produzem o mesmo hash', () => {
      const a = computeConfigHash({ ...BASE, tools: ['c', 'a', 'b'] })
      const b = computeConfigHash({ ...BASE, tools: ['a', 'b', 'c'] })
      const c = computeConfigHash({ ...BASE, tools: ['b', 'c', 'a'] })
      expect(a).toBe(b)
      expect(b).toBe(c)
    })

    it('ordem reversa das tools do BASE produz mesmo hash', () => {
      const reversed = { ...BASE, tools: [...BASE.tools].reverse() }
      expect(computeConfigHash(reversed)).toBe(computeConfigHash(BASE))
    })
  })

  describe('sensibilidade — qualquer campo diferente muda o hash', () => {
    it('systemPrompt diferente → hash diferente', () => {
      const h = computeConfigHash({ ...BASE, systemPrompt: 'Outro prompt.' })
      expect(h).not.toBe(computeConfigHash(BASE))
    })

    it('provider diferente → hash diferente', () => {
      expect(computeConfigHash({ ...BASE, provider: 'anthropic' }))
        .not.toBe(computeConfigHash(BASE))
    })

    it('model diferente → hash diferente', () => {
      expect(computeConfigHash({ ...BASE, model: 'gpt-4o-mini' }))
        .not.toBe(computeConfigHash(BASE))
    })

    it('tool adicionada → hash diferente', () => {
      const h = computeConfigHash({ ...BASE, tools: [...BASE.tools, 'transfer_to_human'] })
      expect(h).not.toBe(computeConfigHash(BASE))
    })

    it('tool removida → hash diferente', () => {
      expect(computeConfigHash({ ...BASE, tools: BASE.tools.slice(0, 2) }))
        .not.toBe(computeConfigHash(BASE))
    })

    it('temperature diferente → hash diferente', () => {
      expect(computeConfigHash({ ...BASE, temperature: 0.1 }))
        .not.toBe(computeConfigHash(BASE))
    })

    it('maxTokens diferente → hash diferente', () => {
      expect(computeConfigHash({ ...BASE, maxTokens: 2048 }))
        .not.toBe(computeConfigHash(BASE))
    })

    it('temperature ausente vs presente → hash diferente', () => {
      const withTemp = computeConfigHash({ ...BASE, temperature: 0.5 })
      const withoutTemp = computeConfigHash({
        systemPrompt: BASE.systemPrompt,
        tools: BASE.tools,
        provider: BASE.provider,
        model: BASE.model,
        maxTokens: BASE.maxTokens,
      })
      expect(withTemp).not.toBe(withoutTemp)
    })

    it('maxTokens ausente vs presente → hash diferente', () => {
      const withTokens = computeConfigHash({ ...BASE, maxTokens: 512 })
      const withoutTokens = computeConfigHash({
        systemPrompt: BASE.systemPrompt,
        tools: BASE.tools,
        provider: BASE.provider,
        model: BASE.model,
        temperature: BASE.temperature,
      })
      expect(withTokens).not.toBe(withoutTokens)
    })
  })

  describe('formato do resultado', () => {
    it('resultado é string hex de exatamente 64 caracteres (SHA-256)', () => {
      const hash = computeConfigHash(BASE)
      expect(typeof hash).toBe('string')
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('tools vazio retorna hash válido e estável', () => {
      const h1 = computeConfigHash({ ...BASE, tools: [] })
      const h2 = computeConfigHash({ ...BASE, tools: [] })
      expect(h1).toHaveLength(64)
      expect(h1).toMatch(/^[0-9a-f]{64}$/)
      expect(h1).toBe(h2)
    })
  })

  describe('validação de input — lança em campos inválidos', () => {
    it('provider vazio → lança ZodError', () => {
      expect(() => computeConfigHash({ ...BASE, provider: '' })).toThrow()
    })

    it('model vazio → lança ZodError', () => {
      expect(() => computeConfigHash({ ...BASE, model: '' })).toThrow()
    })
  })
})
