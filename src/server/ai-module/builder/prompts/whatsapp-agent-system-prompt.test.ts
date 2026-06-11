/**
 * Builder Prompts — regression guard das regras duras anti-bug E2E (Jun/2026).
 *
 * Tranca no texto do BUILDER_SYSTEM_PROMPT + BUILDER_JOURNEY_RULES as regras
 * que corrigem os bugs comprovados em E2E: despejo do research_niche no chat,
 * pulo da jornada de cards, "Objetivo registrado" sem tool call, perguntas fora
 * do passo do banner e exposição da saída do validador interno.
 */
import { describe, expect, it } from 'vitest'

import { BUILDER_JOURNEY_RULES } from './journey-rules'
import { BUILDER_SYSTEM_PROMPT } from './whatsapp-agent-system-prompt'

describe('BUILDER_SYSTEM_PROMPT — regras duras', () => {
  it('limita o research_niche a 3 bullets e o trata como insumo interno', () => {
    expect(BUILDER_SYSTEM_PROMPT).toContain('# Pesquisa de nicho (research_niche)')
    expect(BUILDER_SYSTEM_PROMPT).toContain('NO MÁXIMO 3 bullets')
    expect(BUILDER_SYSTEM_PROMPT).toContain(
      'NUNCA chame research_niche e generate_prompt_anatomy no mesmo turno',
    )
    // Lista "O que o criador NÃO vê" inclui o resultado da pesquisa de nicho.
    expect(BUILDER_SYSTEM_PROMPT).toContain('Resultado de pesquisa de nicho')
  })

  it('exige set_project_basics para objetivo/nome em texto livre', () => {
    expect(BUILDER_SYSTEM_PROMPT).toContain('set_project_basics')
    expect(BUILDER_SYSTEM_PROMPT).toMatch(/NUNCA diga que registrou/)
  })

  it('orienta escolhas rápidas via quick_reply_chips real', () => {
    expect(BUILDER_SYSTEM_PROMPT).toContain('quick_reply_chips')
    expect(BUILDER_SYSTEM_PROMPT).toContain(
      'não escreva uma lista de opções para simular botões',
    )
  })

  it('proíbe generate_prompt_anatomy antes de objetivo + persona', () => {
    expect(BUILDER_SYSTEM_PROMPT).toContain(
      'NUNCA chame generate_prompt_anatomy antes de o objetivo estar definido E o tom/persona conhecidos',
    )
  })

  it('mantém a saída do validador interna (sem listar issues ao usuário)', () => {
    expect(BUILDER_SYSTEM_PROMPT).toContain('A saída do validador é INTERNA')
    expect(BUILDER_SYSTEM_PROMPT).toContain('ajustei detalhes técnicos do prompt')
    // O texto antigo mandava listar validation.issues ao usuário — não pode voltar.
    expect(BUILDER_SYSTEM_PROMPT).not.toContain('liste as pendências')
  })
})

describe('BUILDER_JOURNEY_RULES — disciplina do banner', () => {
  it('conduz apenas o passo ativo e registra respostas de outros passos sem anunciar', () => {
    expect(BUILDER_JOURNEY_RULES).toContain('Conduza APENAS o passo do PRÓXIMO PASSO')
    expect(BUILDER_JOURNEY_RULES).toContain('set_project_basics')
    expect(BUILDER_JOURNEY_RULES).toContain('quick_reply_chips({ prompt, chips })')
    expect(BUILDER_JOURNEY_RULES).toContain('SEM anunciar')
  })

  it('em source_ingestion responde curto ancorado no card', () => {
    expect(BUILDER_JOURNEY_RULES).toContain('source_ingestion')
    expect(BUILDER_JOURNEY_RULES).toContain('resposta CURTA ancorada no card')
  })
})
