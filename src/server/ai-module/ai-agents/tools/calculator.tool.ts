/**
 * calculator — builtin tool de aritmética exata.
 *
 * Por quê: LLMs erram contas (parcelas, descontos, % , totais). Esta tool dá ao
 * agente uma calculadora determinística para nunca "calcular de cabeça" valores
 * que vão para o cliente.
 *
 * Segurança: NÃO usa eval/Function. Um parser recursivo-descendente próprio
 * avalia um subconjunto fechado (números, + - * / % **, parênteses, e um
 * catálogo fixo de funções/constantes). Qualquer identificador fora do catálogo
 * é rejeitado — sem acesso a globals, protótipos ou I/O.
 *
 * Exporta:
 *   - evaluateExpression(expr)  ← núcleo puro e testável (lança em erro)
 *   - calculatorInputSchema
 *   - createCalculatorTool()    ← spread em createBuiltinTools()
 */

import { tool } from 'ai'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Catálogo fechado de funções e constantes
// ---------------------------------------------------------------------------

/** Lookup seguro: ignora membros herdados do prototype (constructor, etc.). */
const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key)

type FnSpec = { arity: number | 'variadic'; fn: (args: number[]) => number }

const FUNCTIONS: Record<string, FnSpec> = {
  abs: { arity: 1, fn: ([x]) => Math.abs(x!) },
  sqrt: { arity: 1, fn: ([x]) => Math.sqrt(x!) },
  floor: { arity: 1, fn: ([x]) => Math.floor(x!) },
  ceil: { arity: 1, fn: ([x]) => Math.ceil(x!) },
  ln: { arity: 1, fn: ([x]) => Math.log(x!) },
  log: { arity: 1, fn: ([x]) => Math.log10(x!) },
  exp: { arity: 1, fn: ([x]) => Math.exp(x!) },
  pow: { arity: 2, fn: ([a, b]) => a! ** b! },
  min: { arity: 'variadic', fn: (a) => Math.min(...a) },
  max: { arity: 'variadic', fn: (a) => Math.max(...a) },
  // round(x) ou round(x, casas) — arredondamento financeiro
  round: {
    arity: 'variadic',
    fn: (a) => {
      const x = a[0]!
      const decimals = a.length > 1 ? a[1]! : 0
      const factor = 10 ** decimals
      return Math.round(x * factor) / factor
    },
  },
}

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'op'; value: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' }
  | { kind: 'ident'; value: string }

const NUM_RE = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*/

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const c = input[i]!

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }

    if (c === '(') {
      tokens.push({ kind: 'lparen' })
      i++
      continue
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen' })
      i++
      continue
    }
    if (c === ',') {
      tokens.push({ kind: 'comma' })
      i++
      continue
    }

    // ** antes de * (potência)
    if (c === '*' && input[i + 1] === '*') {
      tokens.push({ kind: 'op', value: '**' })
      i += 2
      continue
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '%') {
      tokens.push({ kind: 'op', value: c })
      i++
      continue
    }

    const rest = input.slice(i)

    const numMatch = NUM_RE.exec(rest)
    if (numMatch) {
      const raw = numMatch[0]
      tokens.push({ kind: 'num', value: Number(raw) })
      i += raw.length
      continue
    }

    const identMatch = IDENT_RE.exec(rest)
    if (identMatch) {
      tokens.push({ kind: 'ident', value: identMatch[0] })
      i += identMatch[0].length
      continue
    }

    throw new Error(`Caractere inválido na expressão: "${c}".`)
  }

  return tokens
}

// ---------------------------------------------------------------------------
// Parser recursivo-descendente
//   expression := term  (('+'|'-') term)*
//   term       := power (('*'|'/'|'%') power)*
//   power      := unary ('**' power)?        (associativo à direita)
//   unary      := ('+'|'-') unary | primary
//   primary    := num | '(' expression ')' | ident['(' args ')']
// ---------------------------------------------------------------------------

/**
 * Avalia uma expressão aritmética. Lança Error com mensagem em PT-BR em
 * qualquer entrada inválida (sintaxe, divisão por zero, função desconhecida,
 * resultado não-finito). NUNCA executa código arbitrário.
 */
export function evaluateExpression(expression: string): number {
  const tokens = tokenize(expression)
  let pos = 0

  const peek = (): Token | undefined => tokens[pos]
  const isOp = (...ops: string[]): boolean => {
    const t = tokens[pos]
    return !!t && t.kind === 'op' && ops.includes(t.value)
  }

  function parseExpression(): number {
    let left = parseTerm()
    while (isOp('+', '-')) {
      const op = (tokens[pos++] as { value: string }).value
      const right = parseTerm()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function parseTerm(): number {
    let left = parsePower()
    while (isOp('*', '/', '%')) {
      const op = (tokens[pos++] as { value: string }).value
      const right = parsePower()
      if (op === '*') {
        left *= right
      } else if (op === '/') {
        if (right === 0) throw new Error('Divisão por zero.')
        left /= right
      } else {
        if (right === 0) throw new Error('Módulo por zero.')
        left %= right
      }
    }
    return left
  }

  function parsePower(): number {
    const base = parseUnary()
    if (isOp('**')) {
      pos++
      const exponent = parsePower() // direita-associativo
      return base ** exponent
    }
    return base
  }

  function parseUnary(): number {
    if (isOp('+', '-')) {
      const op = (tokens[pos++] as { value: string }).value
      const value = parseUnary()
      return op === '-' ? -value : value
    }
    return parsePrimary()
  }

  function parsePrimary(): number {
    const t = peek()
    if (!t) throw new Error('Expressão incompleta.')

    if (t.kind === 'num') {
      pos++
      return t.value
    }

    if (t.kind === 'lparen') {
      pos++
      const value = parseExpression()
      if (peek()?.kind !== 'rparen') throw new Error('Parêntese ")" faltando.')
      pos++
      return value
    }

    if (t.kind === 'ident') {
      pos++
      const name = t.value.toLowerCase()

      // chamada de função: ident '(' args ')'
      if (peek()?.kind === 'lparen') {
        pos++
        const args: number[] = []
        if (peek()?.kind !== 'rparen') {
          args.push(parseExpression())
          while (peek()?.kind === 'comma') {
            pos++
            args.push(parseExpression())
          }
        }
        if (peek()?.kind !== 'rparen') {
          throw new Error(`Parêntese ")" faltando em ${name}().`)
        }
        pos++

        // hasOwn evita "herdar" membros do prototype (constructor, toString,
        // etc.) — sem isso `FUNCTIONS['constructor']` vazaria.
        const spec = hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : undefined
        if (!spec) throw new Error(`Função desconhecida: ${name}.`)

        if (spec.arity === 'variadic') {
          if (args.length < 1) {
            throw new Error(`${name}() precisa de ao menos 1 argumento.`)
          }
          if (name === 'round' && args.length > 2) {
            throw new Error('round() aceita no máximo 2 argumentos.')
          }
        } else if (args.length !== spec.arity) {
          throw new Error(
            `${name}() espera ${spec.arity} argumento(s), recebeu ${args.length}.`,
          )
        }

        return spec.fn(args)
      }

      // constante (mesma proteção de prototype que as funções)
      if (hasOwn(CONSTANTS, name)) return CONSTANTS[name]!

      throw new Error(`Identificador desconhecido: ${name}.`)
    }

    throw new Error('Token inesperado na expressão.')
  }

  const result = parseExpression()
  if (pos !== tokens.length) {
    throw new Error('Expressão inválida (tokens sobrando).')
  }
  if (!Number.isFinite(result)) {
    throw new Error('Resultado não é um número finito.')
  }
  return result
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const calculatorInputSchema = z.object({
  expression: z
    .string()
    .min(1)
    .max(500)
    .describe(
      'Expressão aritmética. Suporta + - * / % ** (potência), parênteses e as ' +
        'funções abs, sqrt, floor, ceil, round(x[,casas]), pow(a,b), min, max, ' +
        'ln, log (base 10), exp, além das constantes pi e e. ' +
        'Ex: "(1500 - 200) * 0.9 / 12".',
    ),
})

export type CalculatorInput = z.infer<typeof calculatorInputSchema>

export interface CalculatorResult {
  success: boolean
  expression: string
  result?: number
  message?: string
}

// ---------------------------------------------------------------------------
// Tool factory (spread into createBuiltinTools())
// ---------------------------------------------------------------------------

export function createCalculatorTool() {
  return tool({
    description:
      'Calculadora para contas EXATAS (parcelas, descontos, percentuais, totais). ' +
      'Use SEMPRE que precisar de um número correto em vez de calcular de cabeça. ' +
      'Não envia nada ao cliente — apenas retorna o resultado para você usar na resposta.',
    inputSchema: calculatorInputSchema,
    execute: async ({ expression }): Promise<CalculatorResult> => {
      try {
        const result = evaluateExpression(expression)
        return { success: true, expression, result }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Erro ao calcular a expressão.'
        return { success: false, expression, message }
      }
    },
  })
}
