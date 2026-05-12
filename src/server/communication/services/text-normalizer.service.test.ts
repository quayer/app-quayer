/**
 * Text Normalizer Service — TDD
 *
 * Cobre 3 funcoes pure:
 *   - isBinaryGarbage(text): detecta lixo binario / base64 contiguo longo
 *   - cleanMessage(text): trim, remove chars de controle (<32 exceto \n e \t),
 *                        colapsa espacos multiplos
 *   - normalizeForAI(message): escolhe entre transcription / content e aplica
 *                              cleanMessage; retorna "[mensagem ilegivel]" se
 *                              isBinaryGarbage.
 *
 * Rodar:
 *   npx vitest run src/server/communication/services/text-normalizer.service.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  isBinaryGarbage,
  cleanMessage,
  normalizeForAI,
} from './text-normalizer.service'

describe('isBinaryGarbage', () => {
  it('retorna false para texto natural ASCII', () => {
    expect(isBinaryGarbage('hello world')).toBe(false)
  })

  it('retorna true para muitos chars nao-printable', () => {
    // 20 chars de controle + 4 ascii printable = 16% printable
    const garbage = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0c\x0e\x0f\x10\x11\x12\x13\x14\x15\x16abcd'
    expect(isBinaryGarbage(garbage)).toBe(true)
  })

  it('retorna true para base64-like contiguo > 200 chars sem espaco', () => {
    // String base64 sintetica de ~240 chars sem espacos
    const base64Long = 'VGhpcyBpcyBhIGxvbmcgYmFzZTY0IHN0cmluZyB3aXRob3V0IHNwYWNl'.repeat(5)
    expect(base64Long.length).toBeGreaterThan(200)
    expect(isBinaryGarbage(base64Long)).toBe(true)
  })

  it('retorna false para string vazia (nao e lixo, e nada)', () => {
    expect(isBinaryGarbage('')).toBe(false)
  })

  it('retorna false para texto com acentos PT-BR', () => {
    expect(isBinaryGarbage('Olá, tudo bem? Acentuação çãõ.')).toBe(false)
  })
})

describe('cleanMessage', () => {
  it('faz trim e colapsa espacos multiplos', () => {
    expect(cleanMessage('  hello   world  ')).toBe('hello world')
  })

  it('remove caracteres de controle (chars < 32) exceto \\n e \\t', () => {
    expect(cleanMessage('test\x00garbage')).toBe('testgarbage')
    expect(cleanMessage('a\x01b\x02c')).toBe('abc')
  })

  it('preserva \\n e \\t', () => {
    const out = cleanMessage('linha1\nlinha2\tcoluna')
    expect(out).toContain('\n')
    expect(out).toContain('\t')
    expect(out).toBe('linha1\nlinha2\tcoluna')
  })

  it('retorna string vazia para input vazio', () => {
    expect(cleanMessage('')).toBe('')
  })
})

describe('normalizeForAI', () => {
  it('usa transcription quando type=audio e transcription existe', () => {
    const out = normalizeForAI({
      type: 'audio',
      content: null,
      transcription: 'ola tudo bem',
    })
    expect(out).toBe('ola tudo bem')
  })

  it('retorna content limpo quando type=text', () => {
    const out = normalizeForAI({
      type: 'text',
      content: 'Mensagem normal',
    })
    expect(out).toBe('Mensagem normal')
  })

  it('retorna string vazia quando content null e sem transcription', () => {
    expect(
      normalizeForAI({ type: 'text', content: null }),
    ).toBe('')
  })

  it('retorna "[mensagem ilegivel]" quando content e lixo binario', () => {
    const garbage = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0c\x0e\x0f\x10\x11\x12\x13\x14\x15\x16abcd'
    const out = normalizeForAI({ type: 'text', content: garbage })
    expect(out).toBe('[mensagem ilegivel]')
  })

  it('aplica cleanMessage no resultado (remove chars de controle do content)', () => {
    const out = normalizeForAI({
      type: 'text',
      content: '  hello\x00 world  ',
    })
    expect(out).toBe('hello world')
  })

  it('prefere transcription a content quando type=video e transcription existe', () => {
    const out = normalizeForAI({
      type: 'video',
      content: 'caption ignorada',
      transcription: 'transcript do video',
    })
    expect(out).toBe('transcript do video')
  })
})
