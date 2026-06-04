/**
 * create_event — builtin calendar tool.
 *
 * Cria um evento no Google Calendar conectado, opcionalmente com link do
 * Google Meet. Use APÓS confirmar com o cliente data/horário (idealmente
 * depois de check_availability).
 *
 * Degradação graciosa igual a schedule_appointment / dispatch_to_agent:
 * se a agenda não estiver conectada (resolveCalendarAccess → null), retorna
 * { success:false, message:'Agenda não conectada' } — o LLM cai para
 * schedule_appointment (registra a intenção em customFields) e confirma por texto.
 *
 * Escopo de credencial: ctx.organizationId (fronteira de tenant). Não passa
 * builderProjectId (runtime de conversa não o carrega) → credencial org-level.
 *
 * Exporta:
 *   - createEventInputSchema
 *   - executeCreateEvent(ctx, input)
 *   - createCreateEventTool(ctx)  ← spread em createBuiltinTools()
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { ToolExecutionContext } from '@/server/ai-module/ai-agents/tools/builtin-tools'
import { resolveCalendarAccess } from '@/lib/calendar/calendar-credential-resolver'
import { insertEvent } from './google-calendar-client'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const createEventInputSchema = z.object({
  title: z
    .string()
    .min(2)
    .max(200)
    .describe('Título do evento (ex: "Consulta — João Silva").'),
  startDateTime: z
    .string()
    .describe('Início, ISO 8601 com timezone (ex: "2026-06-10T14:00:00-03:00").'),
  endDateTime: z
    .string()
    .describe('Fim, ISO 8601 com timezone. Deve ser depois de `startDateTime`.'),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe('Descrição/observações do evento (opcional).'),
  attendeeEmails: z
    .array(z.string().email())
    .max(20)
    .optional()
    .describe('Emails de participantes a convidar (opcional). Eles recebem o convite.'),
  withMeet: z
    .boolean()
    .default(true)
    .describe('Se true, cria um link do Google Meet para o evento (padrão true).'),
  timeZone: z
    .string()
    .optional()
    .describe('IANA timezone (ex: "America/Sao_Paulo"). Opcional se já no offset do ISO.'),
})

export type CreateEventInput = z.infer<typeof createEventInputSchema>

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface CreateEventResult {
  success: boolean
  message: string
  eventId?: string
  htmlLink?: string
  meetLink?: string
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export async function executeCreateEvent(
  ctx: ToolExecutionContext,
  input: CreateEventInput,
): Promise<CreateEventResult> {
  const { title, startDateTime, endDateTime, description, attendeeEmails, withMeet, timeZone } = input

  const access = await resolveCalendarAccess(ctx.organizationId)
  if (!access) {
    return { success: false, message: 'Agenda não conectada' }
  }

  const startMs = Date.parse(startDateTime)
  const endMs = Date.parse(endDateTime)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { success: false, message: 'Datas inválidas. Use ISO 8601 (ex: 2026-06-10T14:00:00-03:00).' }
  }
  if (endMs <= startMs) {
    return { success: false, message: 'O fim do evento deve ser depois do início.' }
  }

  try {
    const event = await insertEvent(access.accessToken, access.calendarId, {
      summary: title,
      description,
      startDateTime,
      endDateTime,
      timeZone,
      attendeeEmails,
      withMeet,
    })

    return {
      success: true,
      eventId: event.id,
      htmlLink: event.htmlLink,
      meetLink: event.hangoutLink,
      message: `Evento criado: "${title}"${event.hangoutLink ? ` (Meet: ${event.hangoutLink})` : ''}.`,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[create_event] Failed:', msg)
    return { success: false, message: `Erro ao criar evento: ${msg}` }
  }
}

// ---------------------------------------------------------------------------
// Tool factory (spread into createBuiltinTools())
// ---------------------------------------------------------------------------

export function createCreateEventTool(ctx: ToolExecutionContext) {
  return tool({
    description:
      'Cria um evento na agenda (Google Calendar), com link do Google Meet por padrão. Use SOMENTE depois de confirmar data e horário com o cliente (idealmente após check_availability). Retorna o link do evento e do Meet. Se a agenda não estiver conectada, retorna success:false — use schedule_appointment para registrar a intenção.',
    inputSchema: createEventInputSchema,
    execute: async (input) => executeCreateEvent(ctx, input),
  })
}
