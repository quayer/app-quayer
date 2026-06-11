/**
 * agent-settings-patch — PATCH parcial tipado das runtime settings.
 *
 * Garante que um PATCH como `{ tts: { enabled: true } }` NÃO reseta
 * buffer/idioma/mídia para os defaults (o bug do antigo z.record(z.unknown())
 * + normalize full-replace).
 */
import { describe, expect, it } from 'vitest'

import type { AgentRuntimeSettings } from '@/lib/agent-runtime-settings'
import {
  agentRuntimeSettingsPatchSchema,
  applyAgentRuntimeSettingsPatch,
} from './agent-settings-patch'

const current: AgentRuntimeSettings = {
  typingIndicatorEnabled: false,
  languageDetectionEnabled: true,
  messageBuffer: { enabled: true, timeoutMs: 12000, maxMessages: 5 },
  media: {
    audioTranscriptionEnabled: false,
    imageUnderstandingEnabled: true,
    documentUnderstandingEnabled: false,
    videoUnderstandingEnabled: true,
  },
  tts: {
    enabled: false,
    provider: 'deepgram',
    voiceId: 'aura-2-stella-en',
    model: 'eleven_flash_v2_5',
    speechRate: 1.2,
  },
}

describe('applyAgentRuntimeSettingsPatch', () => {
  it('patch parcial preserva TODO o resto do estado atual (não volta a default)', () => {
    const merged = applyAgentRuntimeSettingsPatch(current, {
      tts: { enabled: true },
    })

    expect(merged.tts.enabled).toBe(true)
    // Nada além de tts.enabled muda — em particular nada cai para default.
    expect(merged.tts.provider).toBe('deepgram')
    expect(merged.tts.speechRate).toBe(1.2)
    expect(merged.messageBuffer.timeoutMs).toBe(12000)
    expect(merged.messageBuffer.maxMessages).toBe(5)
    expect(merged.languageDetectionEnabled).toBe(true)
    expect(merged.media.audioTranscriptionEnabled).toBe(false)
  })

  it('patch vazio é no-op', () => {
    expect(applyAgentRuntimeSettingsPatch(current, {})).toEqual(current)
  })

  it('patch aninhado parcial mescla campo a campo', () => {
    const merged = applyAgentRuntimeSettingsPatch(current, {
      messageBuffer: { maxMessages: 8 },
      media: { videoUnderstandingEnabled: false },
    })
    expect(merged.messageBuffer).toEqual({
      enabled: true,
      timeoutMs: 12000,
      maxMessages: 8,
    })
    expect(merged.media.videoUnderstandingEnabled).toBe(false)
    expect(merged.media.imageUnderstandingEnabled).toBe(true)
  })

  it('não muta o objeto atual', () => {
    const snapshot = JSON.parse(JSON.stringify(current)) as AgentRuntimeSettings
    applyAgentRuntimeSettingsPatch(current, { typingIndicatorEnabled: true })
    expect(current).toEqual(snapshot)
  })
})

describe('agentRuntimeSettingsPatchSchema', () => {
  it('aceita o objeto completo que a UI envia', () => {
    expect(agentRuntimeSettingsPatchSchema.safeParse(current).success).toBe(true)
  })

  it('aceita patch parcial', () => {
    expect(
      agentRuntimeSettingsPatchSchema.safeParse({ tts: { enabled: true } }).success,
    ).toBe(true)
  })

  it('rejeita chaves desconhecidas (strict)', () => {
    expect(
      agentRuntimeSettingsPatchSchema.safeParse({ enabledTools: ['hack'] }).success,
    ).toBe(false)
  })

  it('rejeita valores fora do range', () => {
    expect(
      agentRuntimeSettingsPatchSchema.safeParse({
        messageBuffer: { timeoutMs: 999 },
      }).success,
    ).toBe(false)
    expect(
      agentRuntimeSettingsPatchSchema.safeParse({
        tts: { speechRate: 2 },
      }).success,
    ).toBe(false)
    expect(
      agentRuntimeSettingsPatchSchema.safeParse({
        tts: { provider: 'openai' },
      }).success,
    ).toBe(false)
  })

  it('aceita voiceId vazio (normalize do repository troca pelo default)', () => {
    expect(
      agentRuntimeSettingsPatchSchema.safeParse({ tts: { voiceId: '' } }).success,
    ).toBe(true)
  })
})
