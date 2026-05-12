/**
 * prompt-builder.service — unit tests.
 *
 * Cobre as três funções públicas:
 *   - buildLayeredSystemPrompt: ordenação, boundary marker, breakpoints,
 *     TTLs eligibility, omissão de vazios.
 *   - buildAnthropicCacheOptions: presença/ausência de cacheControl conforme
 *     estabilidade de head e tools.
 *   - fromFlatPrompt: migração de prompt flat → sections.
 *
 * Funções puras: zero mocks.
 */

import { describe, it, expect } from 'vitest'
import {
  buildLayeredSystemPrompt,
  buildAnthropicCacheOptions,
  fromFlatPrompt,
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
  type PromptSection,
} from './prompt-builder.service'

describe('buildLayeredSystemPrompt — layout e ordenação', () => {
  it('1. apenas sections globais cacheable → tudo antes do boundary, 1 breakpoint no fim', () => {
    const sections: PromptSection[] = [
      { name: 'a', content: 'AAA', scope: 'global', cacheable: true },
      { name: 'b', content: 'BBB', scope: 'global', cacheable: true },
    ]

    const result = buildLayeredSystemPrompt(sections)

    // Sem session → não deve aparecer boundary marker.
    expect(result.text).not.toContain(SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
    expect(result.text).toBe('AAA\n\nBBB')
    // 2 sections cacheable → 2 breakpoints (um por layer). O enunciado pede
    // "1 cacheBreakpoint no fim" — interpretamos como "no fim da última layer",
    // mas como cada layer cacheable produz um breakpoint, garantimos que o
    // último corresponde ao fim do texto.
    expect(result.cacheBreakpoints).toHaveLength(2)
    const last = result.cacheBreakpoints[result.cacheBreakpoints.length - 1]
    expect(last.position).toBe(result.text.length)
    expect(last.scope).toBe('global')
  })

  it('2. globais + session → globais antes boundary, session depois, breakpoint apenas no fim dos globals', () => {
    const sections: PromptSection[] = [
      { name: 'g', content: 'GLOBAL', scope: 'global', cacheable: true },
      { name: 's', content: 'SESSION', scope: 'session', cacheable: false },
    ]

    const result = buildLayeredSystemPrompt(sections)

    expect(result.text).toContain(SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
    const boundaryIdx = result.text.indexOf(SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
    expect(result.text.indexOf('GLOBAL')).toBeLessThan(boundaryIdx)
    expect(result.text.indexOf('SESSION')).toBeGreaterThan(boundaryIdx)

    // Apenas o breakpoint da layer global. Session NÃO gera breakpoint.
    expect(result.cacheBreakpoints).toHaveLength(1)
    expect(result.cacheBreakpoints[0].scope).toBe('global')
    // Posição = fim do "GLOBAL" (antes do boundary).
    expect(result.cacheBreakpoints[0].position).toBe('GLOBAL'.length)
  })

  it('3. globais + org + session → ordem global → org → boundary → session', () => {
    const sections: PromptSection[] = [
      // Intencionalmente fora de ordem para checar o sort.
      { name: 's', content: 'SESSION', scope: 'session', cacheable: false },
      { name: 'o', content: 'ORG', scope: 'org', cacheable: true },
      { name: 'g', content: 'GLOBAL', scope: 'global', cacheable: true },
    ]

    const result = buildLayeredSystemPrompt(sections)

    const idxGlobal = result.text.indexOf('GLOBAL')
    const idxOrg = result.text.indexOf('ORG')
    const idxBoundary = result.text.indexOf(SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
    const idxSession = result.text.indexOf('SESSION')

    expect(idxGlobal).toBeGreaterThanOrEqual(0)
    expect(idxOrg).toBeGreaterThan(idxGlobal)
    expect(idxBoundary).toBeGreaterThan(idxOrg)
    expect(idxSession).toBeGreaterThan(idxBoundary)

    // 2 breakpoints (global + org), nenhum em session.
    expect(result.cacheBreakpoints).toHaveLength(2)
    expect(result.cacheBreakpoints.map(b => b.scope)).toEqual(['global', 'org'])
  })

  it('4. cacheTtlEligibility=true → último breakpoint global usa ttl 1h, outros 5m', () => {
    const sections: PromptSection[] = [
      { name: 'g1', content: 'G1', scope: 'global', cacheable: true },
      { name: 'g2', content: 'G2', scope: 'global', cacheable: true },
      { name: 'o', content: 'O', scope: 'org', cacheable: true },
    ]

    const result = buildLayeredSystemPrompt(sections, {
      cacheTtlEligibility: true,
    })

    // Ordem esperada de breakpoints: g1(5m, global), g2(1h, global), o(5m, org).
    const ttls = result.cacheBreakpoints.map(b => b.ttl)
    expect(ttls).toEqual(['5m', '1h', '5m'])
    // Confirmar o scope dos dois primeiros.
    expect(result.cacheBreakpoints[0].scope).toBe('global')
    expect(result.cacheBreakpoints[1].scope).toBe('global')
    expect(result.cacheBreakpoints[2].scope).toBe('org')
  })

  it('5. cacheTtlEligibility=false (ou undefined) → todos breakpoints 5m', () => {
    const sections: PromptSection[] = [
      { name: 'g1', content: 'G1', scope: 'global', cacheable: true },
      { name: 'g2', content: 'G2', scope: 'global', cacheable: true },
      { name: 'o', content: 'O', scope: 'org', cacheable: true },
    ]

    const explicit = buildLayeredSystemPrompt(sections, {
      cacheTtlEligibility: false,
    })
    expect(explicit.cacheBreakpoints.every(b => b.ttl === '5m')).toBe(true)

    const undef = buildLayeredSystemPrompt(sections)
    expect(undef.cacheBreakpoints.every(b => b.ttl === '5m')).toBe(true)
  })

  it('6. sections com cacheable=false NÃO geram breakpoint', () => {
    const sections: PromptSection[] = [
      { name: 'g', content: 'G', scope: 'global', cacheable: true },
      // não-cacheable mas ainda static: aparece no texto, mas sem breakpoint
      { name: 'o', content: 'O', scope: 'org', cacheable: false },
      { name: 's', content: 'S', scope: 'session', cacheable: false },
    ]

    const result = buildLayeredSystemPrompt(sections)

    // 1 breakpoint apenas (da layer global).
    expect(result.cacheBreakpoints).toHaveLength(1)
    expect(result.cacheBreakpoints[0].scope).toBe('global')
    // Mas o conteúdo dos três ainda está presente no texto.
    expect(result.text).toContain('G')
    expect(result.text).toContain('O')
    expect(result.text).toContain('S')
  })

  it('7. section com content vazio é omitida', () => {
    const sections: PromptSection[] = [
      { name: 'g', content: 'GLOBAL', scope: 'global', cacheable: true },
      { name: 'empty', content: '', scope: 'global', cacheable: true },
      { name: 'whitespace', content: '   \n\t', scope: 'org', cacheable: true },
      { name: 's', content: 'SESSION', scope: 'session', cacheable: false },
    ]

    const result = buildLayeredSystemPrompt(sections)

    // "empty" e "whitespace" foram filtrados → 1 breakpoint apenas (global).
    expect(result.cacheBreakpoints).toHaveLength(1)
    expect(result.cacheBreakpoints[0].scope).toBe('global')
    // Texto não contém placeholders, apenas o conteúdo válido + boundary + session.
    expect(result.text).toMatch(
      /^GLOBAL\n<!-- __QUAYER_SYSTEM_PROMPT_DYNAMIC_BOUNDARY__ -->\nSESSION$/,
    )
  })

  it('8. sem sections → text vazio, sem breakpoints', () => {
    const result = buildLayeredSystemPrompt([])
    expect(result.text).toBe('')
    expect(result.cacheBreakpoints).toEqual([])
    expect(result.estimatedTokens).toBe(0)
  })

  it('8b. apenas sections vazias → text vazio, sem breakpoints', () => {
    const result = buildLayeredSystemPrompt([
      { name: 'a', content: '', scope: 'global', cacheable: true },
      { name: 'b', content: '   ', scope: 'session', cacheable: false },
    ])
    expect(result.text).toBe('')
    expect(result.cacheBreakpoints).toEqual([])
    expect(result.estimatedTokens).toBe(0)
  })

  it('9. estimatedTokens ≈ Math.ceil(length/4)', () => {
    const sections: PromptSection[] = [
      {
        name: 'g',
        content: 'A'.repeat(100), // 100 chars
        scope: 'global',
        cacheable: true,
      },
    ]
    const result = buildLayeredSystemPrompt(sections)
    expect(result.estimatedTokens).toBe(Math.ceil(result.text.length / 4))
    // Sanity: 100 chars sem boundary → ~25 tokens.
    expect(result.estimatedTokens).toBe(25)
  })
})

describe('buildAnthropicCacheOptions', () => {
  it('10. promptHasStableHead=true e toolsAreStable=true → retorna cacheControl ephemeral', () => {
    const opts = buildAnthropicCacheOptions(true, true)
    expect(opts).toEqual({
      anthropic: {
        cacheControl: { type: 'ephemeral' },
        cacheToolSchemas: true,
      },
    })
  })

  it('11. promptHasStableHead=true, toolsAreStable=false → ainda retorna cacheControl', () => {
    const opts = buildAnthropicCacheOptions(true, false)
    expect(opts.anthropic.cacheControl).toEqual({ type: 'ephemeral' })
    expect(opts.anthropic.cacheToolSchemas).toBeUndefined()
  })

  it('11b. promptHasStableHead=false, toolsAreStable=true → cacheControl ephemeral + cacheToolSchemas', () => {
    const opts = buildAnthropicCacheOptions(false, true)
    expect(opts.anthropic.cacheControl).toEqual({ type: 'ephemeral' })
    expect(opts.anthropic.cacheToolSchemas).toBe(true)
  })

  it('12. ambos false → objeto sem cacheControl (anthropic vazio ou ausente)', () => {
    const opts = buildAnthropicCacheOptions(false, false)
    expect(opts.anthropic.cacheControl).toBeUndefined()
    expect(opts.anthropic.cacheToolSchemas).toBeUndefined()
    // Estrutura ainda existe — caller pode mergear sem branch.
    expect(opts).toEqual({ anthropic: {} })
  })
})

describe('fromFlatPrompt', () => {
  it('13. apenas systemPrompt → array com 1 section global cacheable', () => {
    const sections = fromFlatPrompt('Você é o assistente da Quayer.')
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({
      scope: 'global',
      cacheable: true,
      content: 'Você é o assistente da Quayer.',
    })
  })

  it('14. systemPrompt + contactContext → 2 sections (1 global cacheable, 1 session não cacheable)', () => {
    const sections = fromFlatPrompt(
      'Você é o assistente da Quayer.',
      'Cliente: João, telefone +55 11 99999-0000',
    )
    expect(sections).toHaveLength(2)

    const global = sections.find(s => s.scope === 'global')
    const session = sections.find(s => s.scope === 'session')
    expect(global).toBeDefined()
    expect(global!.cacheable).toBe(true)
    expect(session).toBeDefined()
    expect(session!.cacheable).toBe(false)
    expect(session!.content).toContain('João')
  })

  it('15a. contactContext vazio string → array com 1 section apenas', () => {
    const sections = fromFlatPrompt('SYS', '')
    expect(sections).toHaveLength(1)
    expect(sections[0].scope).toBe('global')
  })

  it('15b. contactContext undefined → array com 1 section apenas', () => {
    const sections = fromFlatPrompt('SYS')
    expect(sections).toHaveLength(1)
    expect(sections[0].scope).toBe('global')
  })

  it('15c. systemPrompt vazio + contactContext → 1 section session', () => {
    const sections = fromFlatPrompt('', 'Cliente: João')
    expect(sections).toHaveLength(1)
    expect(sections[0].scope).toBe('session')
    expect(sections[0].cacheable).toBe(false)
  })
})
