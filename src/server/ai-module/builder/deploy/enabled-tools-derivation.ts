/**
 * Builder Module — Derivação determinística de `enabledTools` (FR-09/FR-10 da
 * spec `specs/jornada-builder-v2/spec.md`)
 *
 * As capacidades TÉCNICAS do agente publicado DERIVAM das decisões do usuário —
 * nunca são re-decididas numa segunda superfície:
 *
 *   - pricing (card de preços)        → get_pricing            (materialize_pricing)
 *   - handoff (card unificado, modo)  → transfer_to_human
 *                                       (+ create_lead c/ roteiro) (materialize_team)
 *   - agenda (alsoSchedule + conexão) → check_availability / create_event /
 *                                       cancel_event / calendar_list_slots, OU
 *                                       schedule_appointment como FALLBACK sem
 *                                       conexão                 (materialize_team)
 *
 * Fecha os bugs de costura comprovados em auditoria: catálogo de preços
 * materializado mas `get_pricing` nunca anexada (catálogo órfão); modo roleta
 * publicado sem `transfer_to_human` (agente que não consegue transferir);
 * "Agenda Google" marcada no antigo card de tools sem exigir conexão real.
 *
 * Estrutura: os helpers PUROS (`derive*ToolChanges` + `reconcileEnabledTools`,
 * zero IO, zero `any`) vivem em `enabled-tools-derivation.pure.ts` (client-safe,
 * sem dependência de `@/server/services/database`) e são RE-EXPORTADOS daqui
 * para os imports existentes seguirem intactos. Este arquivo retém apenas o
 * probe de IO (`hasActiveCalendarConnection`) que espelha o escopo de
 * `resolveCalendarAccess` (src/lib/calendar) — a MESMA fonte que o runtime usa
 * para decidir se a agenda funciona.
 */

import { ProviderCategory } from '@prisma/client'

import { database } from '@/server/services/database'
import { GOOGLE_CALENDAR_PROVIDER } from '@/lib/calendar/types'

export {
  CALENDAR_TOOL_KEYS,
  SCHEDULE_FALLBACK_TOOL_KEY,
  PROACTIVE_FOLLOWUP_TOOL_KEY,
  reconcileEnabledTools,
  derivePricingToolChanges,
  deriveHandoffToolChanges,
  deriveCalendarToolChanges,
  deriveProactiveToolChanges,
} from './enabled-tools-derivation.pure'
export type {
  EnabledToolsChange,
  EnabledToolsPlan,
} from './enabled-tools-derivation.pure'

// ==========================================
// hasActiveCalendarConnection (IO — único probe do módulo)
// ==========================================

/**
 * `true` quando existe credencial ATIVA de Google Calendar para a org —
 * override do projeto OU org-level — espelhando EXATAMENTE o escopo de
 * `resolveCalendarAccess` (a fonte que as tools de runtime usam). É o gate
 * determinístico de FR-11: a derivação só anexa as tools reais quando a
 * conexão que o runtime consultará de fato existe.
 *
 * FAIL-OPEN para o fallback: erro de leitura degrada para `false` (loga e
 * NÃO lança) — o deploy segue com `schedule_appointment`, nunca publica
 * tools de calendário que não funcionariam (NFR-06).
 */
export async function hasActiveCalendarConnection(
  organizationId: string,
  builderProjectId: string,
): Promise<boolean> {
  try {
    const row = await database.organizationProvider.findFirst({
      where: {
        organizationId,
        category: ProviderCategory.AUXILIARY,
        provider: GOOGLE_CALENDAR_PROVIDER,
        isActive: true,
        // Override do projeto OU credencial org-level (IN ignora NULL em SQL —
        // OR explícito, igual a calendar-credential-resolver.ts).
        OR: [{ builderProjectId }, { builderProjectId: null }],
      },
      select: { id: true },
    })
    return row !== null
  } catch (error) {
    console.warn(
      '[deploy/enabled-tools] falha ao checar conexão de agenda — degradando para fallback schedule_appointment:',
      error,
    )
    return false
  }
}
