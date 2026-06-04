/**
 * cancel_event — builtin calendar tool.
 *
 * Cancela (deleta) um evento do Google Calendar pelo eventId. Notifica os
 * participantes (sendUpdates=all). Use o eventId retornado por create_event.
 *
 * Degradação graciosa igual a schedule_appointment / dispatch_to_agent:
 * se a agenda não estiver conectada (resolveCalendarAccess → null), retorna
 * { success:false, message:'Agenda não conectada' } em vez de lançar.
 *
 * Tratamento de 404 (evento já removido / id errado): a API responde HTTP 404,
 * que vira erro; reportamos como success:false com mensagem clara para o LLM.
 *
 * Escopo de credencial: ctx.organizationId (fronteira de tenant). Não passa
 * builderProjectId → credencial org-level.
 *
 * Exporta:
 *   - cancelEventInputSchema
 *   - executeCancelEvent(ctx, input)
 *   - createCancelEventTool(ctx)  ← spread em createBuiltinTools()
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { ToolExecutionContext } from '@/server/ai-module/ai-agents/tools/builtin-tools'
import { resolveCalendarAccess } from '@/lib/calendar/calendar-credential-resolver'
import { deleteEvent } from './google-calendar-client'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const cancelEventInputSchema = z.object({
  eventId: z
    .string()
    .min(1)
    .describe('ID do evento a cancelar (o `eventId` devolvido por create_event).'),
})

export type CancelEventInput = z.infer<typeof cancelEventInputSchema>

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface CancelEventResult {
  success: boolean
  message: string
  eventId?: string
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export async function executeCancelEvent(
  ctx: ToolExecutionContext,
  input: CancelEventInput,
): Promise<CancelEventResult> {
  const { eventId } = input

  const access = await resolveCalendarAccess(ctx.organizationId)
  if (!access) {
    return { success: false, message: 'Agenda não conectada' }
  }

  try {
    await deleteEvent(access.accessToken, access.calendarId, eventId)
    return {
      success: true,
      eventId,
      message: 'Evento cancelado com sucesso.',
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido'
    // 404 → evento inexistente / id incorreto: mensagem dedicada para o LLM.
    if (msg.includes('404')) {
      return {
        success: false,
        eventId,
        message: 'Evento não encontrado (já cancelado ou ID incorreto).',
      }
    }
    console.error('[cancel_event] Failed:', msg)
    return { success: false, eventId, message: `Erro ao cancelar evento: ${msg}` }
  }
}

// ---------------------------------------------------------------------------
// Tool factory (spread into createBuiltinTools())
// ---------------------------------------------------------------------------

export function createCancelEventTool(ctx: ToolExecutionContext) {
  return tool({
    description:
      'Cancela um evento da agenda (Google Calendar) pelo eventId e notifica os participantes. Use o eventId retornado por create_event. Se a agenda não estiver conectada, retorna success:false.',
    inputSchema: cancelEventInputSchema,
    execute: async (input) => executeCancelEvent(ctx, input),
  })
}
