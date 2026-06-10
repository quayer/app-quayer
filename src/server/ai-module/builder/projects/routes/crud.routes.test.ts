/**
 * deriveProjectName — unit tests (FR-04 da spec jornada-builder-v2)
 *
 * O nome do projeto exibido na sidebar deve ser curto e legível — nunca a
 * primeira linha bruta do prompt (que vinha com URL inteira e 80 chars).
 */
import { describe, expect, it } from 'vitest'

import { deriveProjectName } from './crud.routes'

describe('deriveProjectName', () => {
  it('remove URLs da primeira linha', () => {
    const name = deriveProjectName(
      'Quero criar um SDR imobiliário para o Vibra Butantã https://vibraresidencial.com.br/produtos/vibra-butanta/',
    )
    expect(name).not.toMatch(/https?:|vibraresidencial/)
    expect(name).toContain('SDR imobiliário')
  })

  it('corta em ~40 chars no limite de palavra, sem pontuação pendurada', () => {
    const name = deriveProjectName(
      'Quero um agente de WhatsApp para minha hamburgueria artesanal do centro, com pedidos e cardápio',
    )
    expect(name.length).toBeLessThanOrEqual(41)
    expect(name).not.toMatch(/[\s,.;:]$/)
    // nunca corta no meio de palavra: o resultado é prefixo terminando em palavra completa
    expect(
      'Quero um agente de WhatsApp para minha hamburgueria artesanal do centro, com pedidos e cardápio'.startsWith(
        name,
      ),
    ).toBe(true)
  })

  it('usa só a primeira linha do prompt', () => {
    expect(deriveProjectName('Barbearia do Zé\ncom todos os detalhes longos')).toBe(
      'Barbearia do Zé',
    )
  })

  it('cai no fallback quando a linha vira nada útil (só URL)', () => {
    expect(deriveProjectName('https://example.com/pagina')).toBe('Novo agente')
  })

  it('fallback para prompt vazio/curto demais', () => {
    expect(deriveProjectName('')).toBe('Novo agente')
    expect(deriveProjectName('ok')).toBe('Novo agente')
  })

  it('mantém linha curta intacta', () => {
    expect(deriveProjectName('SDR da Clínica Aurora')).toBe('SDR da Clínica Aurora')
  })
})
