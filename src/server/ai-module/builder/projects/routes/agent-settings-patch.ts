/**
 * Agent runtime settings — PATCH parcial tipado.
 *
 * Substitui o antigo `z.record(z.unknown())` do PATCH
 * /builder/projects/:id/agent-settings: o body espelha AgentRuntimeSettings com
 * todos os campos opcionais (deep-partial, strict) e o handler aplica o patch
 * sobre o estado ATUAL antes de persistir. Sem isso, um PATCH parcial como
 * `{ "tts": { "enabled": true } }` resetava buffer/idioma/mídia para os
 * defaults silenciosamente (full-replace disfarçado de PATCH).
 */

import { z } from 'zod'
import type { AgentRuntimeSettings } from '@/lib/agent-runtime-settings'

export const agentRuntimeSettingsPatchSchema = z
  .object({
    typingIndicatorEnabled: z.boolean().optional(),
    languageDetectionEnabled: z.boolean().optional(),
    messageBuffer: z
      .object({
        enabled: z.boolean().optional(),
        timeoutMs: z.number().int().min(1000).max(30000).optional(),
        maxMessages: z.number().int().min(2).max(20).optional(),
      })
      .strict()
      .optional(),
    media: z
      .object({
        audioTranscriptionEnabled: z.boolean().optional(),
        imageUnderstandingEnabled: z.boolean().optional(),
        documentUnderstandingEnabled: z.boolean().optional(),
        videoUnderstandingEnabled: z.boolean().optional(),
      })
      .strict()
      .optional(),
    tts: z
      .object({
        enabled: z.boolean().optional(),
        provider: z.enum(['elevenlabs', 'deepgram']).optional(),
        // voiceId/model aceitam '' — o normalize do repository troca vazio pelo
        // default do provider (era o comportamento da UI antes deste patch).
        voiceId: z.string().trim().max(120).optional(),
        model: z.string().trim().max(120).optional(),
        speechRate: z.number().min(0.7).max(1.3).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export type AgentRuntimeSettingsPatch = z.infer<typeof agentRuntimeSettingsPatchSchema>

/**
 * Aplica um patch parcial sobre as settings atuais (deep-merge campo a campo).
 * Campos ausentes no patch preservam o valor atual — nunca o default.
 */
export function applyAgentRuntimeSettingsPatch(
  current: AgentRuntimeSettings,
  patch: AgentRuntimeSettingsPatch,
): AgentRuntimeSettings {
  return {
    typingIndicatorEnabled:
      patch.typingIndicatorEnabled ?? current.typingIndicatorEnabled,
    languageDetectionEnabled:
      patch.languageDetectionEnabled ?? current.languageDetectionEnabled,
    messageBuffer: { ...current.messageBuffer, ...(patch.messageBuffer ?? {}) },
    media: { ...current.media, ...(patch.media ?? {}) },
    tts: { ...current.tts, ...(patch.tts ?? {}) },
  }
}
