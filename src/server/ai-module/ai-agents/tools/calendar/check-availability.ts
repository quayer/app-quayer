/**
 * check_availability — builtin calendar tool.
 *
 * Consulta os horários LIVRES de um Google Calendar conectado via freebusy,
 * dentro de uma janela [from, to], em blocos de `slotMinutes`.
 *
 * Padrão de degradação graciosa igual a schedule_appointment / dispatch_to_agent:
 * se a agenda não estiver conectada (resolveCalendarAccess → null), retorna
 * { success:false, message:'Agenda não conectada' } em vez de lançar — o LLM
 * confirma por texto ou cai para schedule_appointment.
 *
 * Escopo de credencial: usa ctx.organizationId (mesma fronteira de tenant que
 * as demais builtin tools). builderProjectId não é passado aqui (runtime de
 * conversa não carrega o id do projeto Builder); cai para credencial org-level.
 *
 * Exporta:
 *   - checkAvailabilityInputSchema
 *   - executeCheckAvailability(ctx, input)
 *   - createCheckAvailabilityTool(ctx)  ← spread em createBuiltinTools()
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { ToolExecutionContext } from '@/server/ai-module/ai-agents/tools/builtin-tools'
import { resolveCalendarAccess } from '@/lib/calendar/calendar-credential-resolver'
import { queryFreeBusy, type FreeBusyInterval } from './google-calendar-client'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const checkAvailabilityInputSchema = z.object({
  from: z
    .string()
    .describe(
      'Início da janela de busca, ISO 8601 com timezone (ex: "2026-06-10T09:00:00-03:00").',
    ),
  to: z
    .string()
    .describe(
      'Fim da janela de busca, ISO 8601 com timezone. Deve ser depois de `from` e, no máximo, ~14 dias após.',
    ),
  slotMinutes: z
    .number()
    .int()
    .min(15)
    .max(480)
    .default(60)
    .describe('Duração de cada slot livre em minutos (15–480, padrão 60).'),
  maxSlots: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(8)
    .describe('Máximo de slots livres a retornar (1–20, padrão 8).'),
  timeZone: z
    .string()
    .optional()
    .describe('IANA timezone para o freebusy (ex: "America/Sao_Paulo"). Opcional.'),
})

export type CheckAvailabilityInput = z.infer<typeof checkAvailabilityInputSchema>

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface AvailabilitySlot {
  start: string // ISO 8601
  end: string // ISO 8601
}

export interface CheckAvailabilityResult {
  success: boolean
  message: string
  slots?: AvailabilitySlot[]
  count?: number
}

// ---------------------------------------------------------------------------
// Free-slot computation (complement of busy intervals within the window)
// ---------------------------------------------------------------------------

/**
 * Given busy intervals, computes up to `maxSlots` free slots of `slotMinutes`
 * each, walking the window [windowStart, windowEnd] forward and skipping over
 * any overlap with a busy interval.
 */
export function computeFreeSlots(
  windowStartMs: number,
  windowEndMs: number,
  busy: FreeBusyInterval[],
  slotMs: number,
  maxSlots: number,
): AvailabilitySlot[] {
  // Normalize + sort busy intervals by start.
  const intervals = busy
    .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .sort((a, b) => a.start - b.start)

  const slots: AvailabilitySlot[] = []
  let cursor = windowStartMs

  while (cursor + slotMs <= windowEndMs && slots.length < maxSlots) {
    const slotEnd = cursor + slotMs

    // Find a busy interval overlapping [cursor, slotEnd).
    const overlap = intervals.find((b) => b.start < slotEnd && b.end > cursor)

    if (overlap) {
      // Jump the cursor to the end of the blocking interval and retry.
      cursor = overlap.end
      continue
    }

    slots.push({ start: new Date(cursor).toISOString(), end: new Date(slotEnd).toISOString() })
    cursor = slotEnd
  }

  return slots
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export async function executeCheckAvailability(
  ctx: ToolExecutionContext,
  input: CheckAvailabilityInput,
): Promise<CheckAvailabilityResult> {
  const { from, to, slotMinutes, maxSlots, timeZone } = input

  const access = await resolveCalendarAccess(ctx.organizationId)
  if (!access) {
    return { success: false, message: 'Agenda não conectada' }
  }

  const fromMs = Date.parse(from)
  const toMs = Date.parse(to)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return { success: false, message: 'Datas inválidas. Use ISO 8601 (ex: 2026-06-10T09:00:00-03:00).' }
  }
  if (toMs <= fromMs) {
    return { success: false, message: 'O fim da janela (`to`) deve ser depois do início (`from`).' }
  }

  try {
    const busy = await queryFreeBusy(access.accessToken, access.calendarId, from, to, timeZone)
    const slots = computeFreeSlots(fromMs, toMs, busy, slotMinutes * 60_000, maxSlots)

    if (slots.length === 0) {
      return {
        success: true,
        slots: [],
        count: 0,
        message: 'Nenhum horário livre encontrado nessa janela.',
      }
    }

    return {
      success: true,
      slots,
      count: slots.length,
      message: `${slots.length} horário(s) livre(s) encontrado(s).`,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[check_availability] Failed:', msg)
    return { success: false, message: `Erro ao consultar agenda: ${msg}` }
  }
}

// ---------------------------------------------------------------------------
// Tool factory (spread into createBuiltinTools())
// ---------------------------------------------------------------------------

export function createCheckAvailabilityTool(ctx: ToolExecutionContext) {
  return tool({
    description:
      'Consulta os horários LIVRES da agenda (Google Calendar) em uma janela de tempo. Use antes de oferecer horários ao cliente ou antes de criar um evento. Retorna slots livres de duração configurável. Se a agenda não estiver conectada, retorna success:false — nesse caso use schedule_appointment para registrar a intenção.',
    inputSchema: checkAvailabilityInputSchema,
    execute: async (input) => executeCheckAvailability(ctx, input),
  })
}
