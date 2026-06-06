/**
 * Unit tests da tool calculator (avaliador aritmético seguro).
 */

import { describe, it, expect } from 'vitest'
import { evaluateExpression, createCalculatorTool } from './calculator.tool'

describe('evaluateExpression', () => {
  it('faz as 4 operações e respeita precedência', () => {
    expect(evaluateExpression('1 + 2 * 3')).toBe(7)
    expect(evaluateExpression('(1 + 2) * 3')).toBe(9)
    expect(evaluateExpression('10 - 4 - 3')).toBe(3) // esquerda-associativo
    expect(evaluateExpression('20 / 4 / 5')).toBe(1)
  })

  it('suporta módulo e potência (direita-associativa)', () => {
    expect(evaluateExpression('10 % 3')).toBe(1)
    expect(evaluateExpression('2 ** 3 ** 2')).toBe(512) // 2 ** (3 ** 2)
    expect(evaluateExpression('2 ** 10')).toBe(1024)
  })

  it('trata unário e decimais/notação científica', () => {
    expect(evaluateExpression('-5 + 3')).toBe(-2)
    expect(evaluateExpression('-(2 + 3)')).toBe(-5)
    expect(evaluateExpression('0.1 + 0.2')).toBeCloseTo(0.3, 10)
    expect(evaluateExpression('1.5e3')).toBe(1500)
    expect(evaluateExpression('.5 * 4')).toBe(2)
  })

  it('aplica funções e constantes do catálogo', () => {
    expect(evaluateExpression('sqrt(16)')).toBe(4)
    expect(evaluateExpression('abs(-7)')).toBe(7)
    expect(evaluateExpression('round(3.14159, 2)')).toBe(3.14)
    expect(evaluateExpression('round(2.5)')).toBe(3)
    expect(evaluateExpression('pow(2, 8)')).toBe(256)
    expect(evaluateExpression('min(3, 1, 2)')).toBe(1)
    expect(evaluateExpression('max(3, 1, 2)')).toBe(3)
    expect(evaluateExpression('floor(4.9)')).toBe(4)
    expect(evaluateExpression('ceil(4.1)')).toBe(5)
    expect(evaluateExpression('pi')).toBeCloseTo(Math.PI, 10)
  })

  it('resolve um caso financeiro realista', () => {
    // (1500 - 200) com 10% off, em 12x
    expect(evaluateExpression('(1500 - 200) * 0.9 / 12')).toBeCloseTo(97.5, 6)
  })

  it('rejeita divisão e módulo por zero', () => {
    expect(() => evaluateExpression('1 / 0')).toThrow(/zero/i)
    expect(() => evaluateExpression('5 % 0')).toThrow(/zero/i)
  })

  it('rejeita identificadores/funções fora do catálogo (anti-eval)', () => {
    expect(() => evaluateExpression('process')).toThrow(/desconhecido/i)
    expect(() => evaluateExpression('alert(1)')).toThrow(/desconhecida/i)
    expect(() => evaluateExpression('constructor')).toThrow(/desconhecido/i)
  })

  it('rejeita sintaxe inválida', () => {
    expect(() => evaluateExpression('1 +')).toThrow()
    expect(() => evaluateExpression('(1 + 2')).toThrow(/faltando/i)
    expect(() => evaluateExpression('1 2')).toThrow(/sobrando/i)
    expect(() => evaluateExpression('@')).toThrow(/inválido/i)
  })

  it('valida aridade das funções', () => {
    expect(() => evaluateExpression('pow(2)')).toThrow(/espera 2/i)
    expect(() => evaluateExpression('round(1, 2, 3)')).toThrow(/no máximo 2/i)
    expect(() => evaluateExpression('min()')).toThrow(/ao menos 1/i)
  })
})

describe('createCalculatorTool', () => {
  async function run(expression: string) {
    const execute = createCalculatorTool().execute
    if (!execute) throw new Error('tool sem execute')
    return execute({ expression }, {} as never)
  }

  it('retorna success:true com o resultado', async () => {
    await expect(run('2 + 2')).resolves.toEqual({
      success: true,
      expression: '2 + 2',
      result: 4,
    })
  })

  it('nunca lança: erro vira success:false com mensagem', async () => {
    const res = (await run('1 / 0')) as { success: boolean; message: string }
    expect(res.success).toBe(false)
    expect(res.message).toMatch(/zero/i)
  })
})
