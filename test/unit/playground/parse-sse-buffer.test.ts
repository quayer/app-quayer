/**
 * Unit — parser SSE local do Playground + tradução de erros.
 *
 * O parser anterior (chat/utils/parse-sse-buffer.ts) era um stub que devolvia
 * `{ events: [], rest: buffer }` sempre — a resposta do agente nunca
 * renderizava na tab Testar. Estes testes pregam o contrato real:
 * blocos `data: <json>\n\n`, bloco parcial em `rest`, payload inválido
 * ignorado sem quebrar o stream.
 */

import { describe, expect, it, vi } from 'vitest'

import { parseSseBuffer } from '@/client/components/projetos/preview/tabs/agent/playground/parse-sse-buffer'
import { translatePlaygroundError } from '@/client/components/projetos/preview/tabs/agent/playground/translate-playground-error'

describe('parseSseBuffer (playground)', () => {
  it('parseia eventos completos e devolve o bloco parcial em rest', () => {
    const buffer =
      'data: {"type":"text-delta","text":"Olá"}\n\n' +
      'data: {"type":"tool-call","toolName":"get_pricing","args":{"q":"corte"}}\n\n' +
      'data: {"type":"text-del'

    const { events, rest } = parseSseBuffer(buffer)

    expect(events).toEqual([
      { type: 'text-delta', text: 'Olá' },
      { type: 'tool-call', toolName: 'get_pricing', args: { q: 'corte' } },
    ])
    expect(rest).toBe('data: {"type":"text-del')
  })

  it('junta múltiplas linhas data: do mesmo bloco antes do JSON.parse', () => {
    // JSON com newline interno é emitido como duas linhas data: no mesmo bloco
    const payload = '{"type":"error",\n"message":"boom"}'
    const buffer =
      payload
        .split('\n')
        .map((l) => `data: ${l}`)
        .join('\n') + '\n\n'

    const { events, rest } = parseSseBuffer(buffer)

    expect(events).toEqual([{ type: 'error', message: 'boom' }])
    expect(rest).toBe('')
  })

  it('ignora payload não-JSON sem derrubar os demais eventos', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const buffer =
      'data: not-json\n\n' + 'data: {"type":"finish","toolCalls":[]}\n\n'

    const { events } = parseSseBuffer(buffer)

    expect(events).toEqual([{ type: 'finish', toolCalls: [] }])
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('ignora blocos sem linha data: (comentários/keep-alive)', () => {
    const { events, rest } = parseSseBuffer(': ping\n\n')
    expect(events).toEqual([])
    expect(rest).toBe('')
  })
})

describe('translatePlaygroundError', () => {
  it('mapeia mensagens conhecidas do runtime para copy PT-BR', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(
      translatePlaygroundError('Agent config abc not found or inactive'),
    ).toMatch(/agente de teste não está disponível/i)
    expect(
      translatePlaygroundError(
        'Context budget exhausted: estimated 9000 tokens exceeds max 4096',
      ),
    ).toMatch(/longa demais/i)
    expect(translatePlaygroundError('401 invalid x-api-key')).toMatch(
      /chave de API/i,
    )
    expect(translatePlaygroundError('Rate limit exceeded (429)')).toMatch(
      /sobrecarregado/i,
    )
    expect(translatePlaygroundError('TypeError: Failed to fetch')).toMatch(
      /conexão/i,
    )

    spy.mockRestore()
  })

  it('usa fallback genérico para mensagens desconhecidas ou vazias', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(translatePlaygroundError('Unknown playground stream error')).toMatch(
      /Não foi possível gerar a resposta/i,
    )
    expect(translatePlaygroundError(null)).toMatch(
      /Não foi possível gerar a resposta/i,
    )
    expect(translatePlaygroundError('')).toMatch(
      /Não foi possível gerar a resposta/i,
    )

    spy.mockRestore()
  })
})
