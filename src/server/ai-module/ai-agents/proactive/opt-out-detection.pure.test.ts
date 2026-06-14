/**
 * opt-out-detection.pure.test — cobre a DETECÇÃO conservadora de opt-out (FR-PRO-08).
 *
 * O contrato que estes testes pinam:
 *   1. Comandos fortes (parar/pare/sair/cancelar/descadastrar/remover/stop) só
 *      disparam quando são a MENSAGEM INTEIRA (curta, isolada).
 *   2. Frases explícitas de descadastro disparam em qualquer posição.
 *   3. FALSO POSITIVO é evitado: "não quero o plano", "vou parar na loja",
 *      "remover um item" NÃO disparam.
 *   4. Normalização robusta: acentos, maiúsculas, pontuação e espaços não afetam.
 */

import { describe, it, expect } from 'vitest'
import { detectOptOut, normalizeForOptOut } from './opt-out-detection.pure'

describe('normalizeForOptOut', () => {
  it('remove acentos, baixa caixa, troca pontuação por espaço e colapsa espaços', () => {
    expect(normalizeForOptOut('Não  QUERO mais, mensagens!!')).toBe(
      'nao quero mais mensagens',
    )
  })

  it('texto só de pontuação/emoji → string vazia', () => {
    expect(normalizeForOptOut('!!! 🙂')).toBe('')
  })
})

describe('detectOptOut — comandos fortes isolados (mensagem inteira)', () => {
  it.each([
    'parar',
    'PARAR',
    'Pare',
    'sair',
    'cancelar',
    'descadastrar',
    'remover',
    'stop',
    'unsubscribe',
    '  parar!! ',
  ])('"%s" sozinho → opt-out', (msg) => {
    expect(detectOptOut(msg)).toBe(true)
  })
})

describe('detectOptOut — frases explícitas de descadastro (qualquer posição)', () => {
  it.each([
    'não quero mais mensagens',
    'nao quero mais receber',
    'não quero receber nada',
    'pode parar de receber por favor',
    'parar de enviar mensagens',
    'pare de me enviar isso',
    'cancelar as mensagens automáticas',
    'me remove da lista por favor',
    'quero me descadastrar dessa lista',
    'não me envie mais nada',
    'não me perturbe mais',
  ])('"%s" → opt-out', (msg) => {
    expect(detectOptOut(msg)).toBe(true)
  })
})

describe('detectOptOut — NÃO dispara em texto normal (sem falso positivo grosseiro)', () => {
  it.each([
    'não quero o plano premium',
    'quero remover um item do meu pedido',
    'vou parar aí na loja amanhã',
    'pode cancelar a consulta de quinta?',
    'quero sair às 18h hoje',
    'não quero pagar mais caro',
    'oi, tudo bem?',
    'qual o valor do produto?',
    '',
    '   ',
  ])('"%s" → NÃO é opt-out', (msg) => {
    expect(detectOptOut(msg)).toBe(false)
  })

  it('null/undefined → false', () => {
    expect(detectOptOut(null)).toBe(false)
    expect(detectOptOut(undefined)).toBe(false)
  })
})
