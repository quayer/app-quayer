/**
 * skill-activator.service — unit tests
 *
 * Cobertura:
 *  - activateSkills: alwaysActive, default loaded, keyword/stage matching, OR
 *    logic, triggers vazios.
 *  - renderActiveSkills: vazio vs com conteúdo.
 *
 * Função pura — sem mocks externos.
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/ai-agents/services/skill-activator.service.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  activateSkills,
  renderActiveSkills,
  type SkillManifest,
} from './skill-activator.service'

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

function skill(overrides: Partial<SkillManifest>): SkillManifest {
  return {
    name: 'test-skill',
    description: 'test',
    content: 'Skill body content.',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// activateSkills
// ---------------------------------------------------------------------------

describe('activateSkills', () => {
  it('1. skill com alwaysActive=true sempre retorna', () => {
    const s = skill({
      name: 'always',
      alwaysActive: true,
      triggers: { keywords: ['xyz-no-match'] },
    })
    const result = activateSkills([s], { messageContent: 'hello' })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('always')
  })

  it('2. skill sem triggers (default loaded) sempre retorna', () => {
    const s = skill({ name: 'default-loaded' })
    const result = activateSkills([s], { messageContent: 'whatever' })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('default-loaded')
  })

  it('3. keyword "preço" + content "qual o preço?" → ativa', () => {
    const s = skill({
      name: 'pricing',
      triggers: { keywords: ['preço'] },
    })
    const result = activateSkills([s], { messageContent: 'qual o preço?' })
    expect(result).toHaveLength(1)
  })

  it('4. match case-insensitive: keyword "Preço" + content "PREÇO BAIXO" → ativa', () => {
    const s = skill({
      name: 'pricing',
      triggers: { keywords: ['Preço'] },
    })
    const result = activateSkills([s], { messageContent: 'PREÇO BAIXO' })
    expect(result).toHaveLength(1)
  })

  it('5. keyword sem match no content → não ativa', () => {
    const s = skill({
      name: 'pricing',
      triggers: { keywords: ['preço'] },
    })
    const result = activateSkills([s], { messageContent: 'oi tudo bem' })
    expect(result).toHaveLength(0)
  })

  it('6. journeyStages: ["qualified"] + session.journeyStage="qualified" → ativa', () => {
    const s = skill({
      name: 'qual-skill',
      triggers: { journeyStages: ['qualified'] },
    })
    const result = activateSkills([s], {
      messageContent: 'oi',
      session: { journeyStage: 'qualified' },
    })
    expect(result).toHaveLength(1)
  })

  it('7. journeyStages: ["qualified"] + session.journeyStage="new" → não ativa', () => {
    const s = skill({
      name: 'qual-skill',
      triggers: { journeyStages: ['qualified'] },
    })
    const result = activateSkills([s], {
      messageContent: 'oi',
      session: { journeyStage: 'new' },
    })
    expect(result).toHaveLength(0)
  })

  it('8. multiple triggers (OR logic): keyword match → ativa mesmo se journeyStage não', () => {
    const s = skill({
      name: 'multi',
      triggers: {
        keywords: ['comprar'],
        journeyStages: ['qualified'],
      },
    })
    const result = activateSkills([s], {
      messageContent: 'quero comprar agora',
      session: { journeyStage: 'new' },
    })
    expect(result).toHaveLength(1)
  })

  it('9. skill com triggers vazios {} → trata como sem triggers (default loaded)', () => {
    const s = skill({
      name: 'empty-triggers',
      triggers: {},
    })
    const result = activateSkills([s], { messageContent: 'qualquer coisa' })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('empty-triggers')
  })
})

// ---------------------------------------------------------------------------
// renderActiveSkills
// ---------------------------------------------------------------------------

describe('renderActiveSkills', () => {
  it('10. renderActiveSkills([]) → retorna string vazia', () => {
    expect(renderActiveSkills([])).toBe('')
  })

  it('11. renderActiveSkills([skill1, skill2]) → inclui header + content de ambos', () => {
    const s1 = skill({ name: 's1', content: 'Body of skill 1.' })
    const s2 = skill({ name: 's2', content: 'Body of skill 2.' })
    const out = renderActiveSkills([s1, s2])
    expect(out).toContain('## Skills ativas')
    expect(out).toContain('Body of skill 1.')
    expect(out).toContain('Body of skill 2.')
    // garante separação entre os corpos
    const idx1 = out.indexOf('Body of skill 1.')
    const idx2 = out.indexOf('Body of skill 2.')
    expect(idx1).toBeGreaterThan(-1)
    expect(idx2).toBeGreaterThan(idx1)
  })
})
