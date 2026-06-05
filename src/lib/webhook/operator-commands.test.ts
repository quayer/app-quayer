/**
 * operator-commands — TDD
 *
 * Rodar:
 *   npx vitest run src/lib/webhook/operator-commands.test.ts
 */

import { describe, it, expect, vi } from 'vitest'
import {
  parseOperatorCommand,
  buildOperatorCommandUpdate,
  applyOperatorCommand,
} from './operator-commands'

describe('parseOperatorCommand', () => {
  it('reconhece @fechar / /encerrar / @finalizar como close', () => {
    expect(parseOperatorCommand('@fechar')?.kind).toBe('close')
    expect(parseOperatorCommand('/encerrar')?.kind).toBe('close')
    expect(parseOperatorCommand('@finalizar')?.kind).toBe('close')
  })

  it('reconhece @ia / @bot / @voltar / @robô (com acento) como return_to_ai', () => {
    expect(parseOperatorCommand('@ia')?.kind).toBe('return_to_ai')
    expect(parseOperatorCommand('@bot')?.kind).toBe('return_to_ai')
    expect(parseOperatorCommand('@voltar')?.kind).toBe('return_to_ai')
    expect(parseOperatorCommand('@robô')?.kind).toBe('return_to_ai')
  })

  it('reconhece blacklist e whitelist (+ aliases)', () => {
    expect(parseOperatorCommand('@blacklist')?.kind).toBe('blacklist')
    expect(parseOperatorCommand('@bloquear')?.kind).toBe('blacklist')
    expect(parseOperatorCommand('@whitelist')?.kind).toBe('whitelist')
    expect(parseOperatorCommand('@liberar')?.kind).toBe('whitelist')
  })

  it('é case-insensitive e tolera espaços nas bordas', () => {
    expect(parseOperatorCommand('@FECHAR')?.kind).toBe('close')
    expect(parseOperatorCommand('  @Fechar  ')?.kind).toBe('close')
  })

  it('retorna null para texto normal, comando desconhecido, sem prefixo ou vazio', () => {
    expect(parseOperatorCommand('oi tudo bem')).toBeNull()
    expect(parseOperatorCommand('@xyz')).toBeNull()
    expect(parseOperatorCommand('fechar')).toBeNull() // sem @
    expect(parseOperatorCommand('')).toBeNull()
    expect(parseOperatorCommand(null)).toBeNull()
    expect(parseOperatorCommand(undefined)).toBeNull()
  })

  it('NÃO casa quando há texto extra depois do verbo (evita falso-positivo)', () => {
    expect(parseOperatorCommand('@fechar isso aqui')).toBeNull()
    expect(parseOperatorCommand('manda @fechar')).toBeNull()
  })
})

describe('buildOperatorCommandUpdate', () => {
  it('close → status CLOSED + aiEnabled false', () => {
    expect(buildOperatorCommandUpdate({ kind: 'close' })).toEqual({
      status: 'CLOSED',
      aiEnabled: false,
    })
  })

  it('return_to_ai → reabilita IA e limpa o bloqueio', () => {
    expect(buildOperatorCommandUpdate({ kind: 'return_to_ai' })).toEqual({
      aiEnabled: true,
      aiBlockReason: null,
      aiBlockedUntil: null,
    })
  })

  it('blacklist → adiciona tag + pausa IA, sem duplicar tag existente', () => {
    expect(buildOperatorCommandUpdate({ kind: 'blacklist' }, ['vip'])).toEqual({
      tags: ['vip', 'blacklist'],
      aiEnabled: false,
      aiBlockReason: 'operator_blacklist',
    })
    const dup = buildOperatorCommandUpdate({ kind: 'blacklist' }, ['blacklist'])
    expect(dup.tags).toEqual(['blacklist'])
  })

  it('whitelist → adiciona tag whitelist', () => {
    expect(buildOperatorCommandUpdate({ kind: 'whitelist' }, [])).toEqual({
      tags: ['whitelist'],
    })
  })
})

describe('applyOperatorCommand', () => {
  it('chama chatSession.update com o data do comando e retorna true', async () => {
    const update = vi.fn().mockResolvedValue({})
    const db = { chatSession: { update } }

    const ok = await applyOperatorCommand(db, 'sess-1', { kind: 'close' }, [])

    expect(ok).toBe(true)
    expect(update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { status: 'CLOSED', aiEnabled: false },
    })
  })

  it('retorna false e não toca no DB quando sessionId é vazio', async () => {
    const update = vi.fn()
    const db = { chatSession: { update } }

    expect(await applyOperatorCommand(db, '', { kind: 'close' })).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('engole o erro do DB e retorna false (não derruba o webhook)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const update = vi.fn().mockRejectedValue(new Error('db down'))
    const db = { chatSession: { update } }

    expect(
      await applyOperatorCommand(db, 'sess-1', { kind: 'blacklist' }, []),
    ).toBe(false)
    warn.mockRestore()
  })
})
