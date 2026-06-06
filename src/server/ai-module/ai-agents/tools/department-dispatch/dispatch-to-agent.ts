/**
 * dispatch_to_agent — execution helper (builtin tool)
 *
 * Routes a conversation to a specific DEPARTMENT and distributes it to the next
 * available human agent via round-robin (roleta), then pauses the AI and
 * notifies that specific agent.
 *
 * Relationship to `transfer_to_human` (builtin-tools.ts:441):
 *   - transfer_to_human → generic queue: pauses AI, notifies the WHOLE org,
 *     does NOT set assignedAgentId/assignedDepartmentId. Next online operator
 *     grabs it from the panel.
 *   - dispatch_to_agent → directed routing: picks a department, picks ONE
 *     person via round-robin, sets assignedDepartmentId + assignedAgentId, and
 *     notifies ONLY that person (Notification.userId). It IS transfer_to_human
 *     + department routing + individual assignment.
 *
 * Both pause the AI identically (aiEnabled=false, pausedBy='agent',
 * status=PAUSED) and write customFields.handoff in the SAME shape so the
 * inbox/panel renders handoffs uniformly regardless of which tool fired.
 *
 * This module exports:
 *   - `dispatchToAgentInputSchema` — Zod schema for the tool input.
 *   - `executeDispatchToAgent(ctx, input)` — the execute() body.
 *   - `createDispatchToAgentTool(ctx)` — the AI SDK tool() definition, ready to
 *     be spread into createBuiltinTools() in builtin-tools.ts.
 *
 * It deliberately does NOT register itself in BUILTIN_TOOL_NAMES nor edit
 * builtin-tools.ts — that wiring is done by the owner of that file (see the
 * wiring instructions returned to the orchestrator).
 */

import { tool } from 'ai'
import { Prisma, type SessionStatus } from '@prisma/client'
import { z } from 'zod'
import { database } from '@/server/services/database'
import type { ToolExecutionContext } from '@/server/ai-module/ai-agents/tools/builtin-tools'
import { selectNextMember } from './round-robin.service'
import { trySendRouletteWhatsApp } from './notify-member-whatsapp'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

/**
 * Input for dispatch_to_agent.
 *
 * `departmentId` (not a free-text name): the agent is "trained" via the system
 * prompt with the org's department list (id + name + type), so it passes an id.
 * This avoids string ambiguity and maps directly to ChatSession.assignedDepartmentId.
 *
 * `reason` / `summary` / `urgency` reuse the exact shape of transfer_to_human so
 * the panel renders handoffs identically no matter which tool dispatched.
 *
 * It does NOT accept an agentId — the roleta is what chooses the human. Passing
 * the member would defeat the purpose.
 */
export const dispatchToAgentInputSchema = z.object({
  departmentId: z
    .string()
    .uuid()
    .describe(
      'Department.id de destino (sales/support/custom). Obrigatório — é a fila da roleta.',
    ),
  reason: z
    .string()
    .min(10)
    .max(500)
    .describe(
      'Por que está encaminhando (ex: "cliente quer falar de contrato de locação")',
    ),
  summary: z
    .string()
    .max(800)
    .optional()
    .describe(
      'Resumo da conversa para o atendente assumir rápido (mesma semântica do transfer_to_human.summary).',
    ),
  urgency: z
    .enum(['low', 'medium', 'high'])
    .default('medium')
    .describe(
      'Urgência da fila — vira tipo da Notification (high=ERROR, senão WARNING).',
    ),
})

export type DispatchToAgentInput = z.infer<typeof dispatchToAgentInputSchema>

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

export interface DispatchToAgentResult {
  success: boolean
  message: string
  departmentId?: string
  /** User.id of the agent the roleta chose, or null on department/empty-pool fallback. */
  assignedAgentId?: string | null
  assignedAgentName?: string | null
  /** How the conversation was routed: 'roulette' (a person) or 'queue' (org-wide fallback). */
  dispatchedVia?: 'roulette' | 'queue'
}

// ---------------------------------------------------------------------------
// Shared handoff effects (pause AI + handoff customFields) — mirrors
// transfer_to_human so the panel stays uniform.
// ---------------------------------------------------------------------------

interface HandoffMutationArgs {
  sessionId: string
  reason: string
  urgency: 'low' | 'medium' | 'high'
  summary: string | null
  departmentId: string
  /** Set only when the roleta picked a person; null on org-wide fallback. */
  assignedAgentId: string | null
  dispatchedVia: 'roulette' | 'queue'
  existingCustomFields: Record<string, unknown>
  /** Current status — preserved when CLOSED, otherwise forced to PAUSED. */
  currentStatus: SessionStatus
  /** Extra tags to push besides the base department_dispatch tag. */
  extraTags: string[]
  /**
   * 6A audit flag — whether the WhatsApp notification to the chosen member was
   * actually sent. `null` when WhatsApp send was not attempted (queue fallback /
   * non-roulette). Stamped into customFields.handoff for the inbox/panel.
   */
  whatsappNotified?: boolean | null
}

/**
 * Applies the handoff mutation to the ChatSession: assigns department (+agent),
 * pauses the AI, records customFields.handoff, and pushes tags. Same fields and
 * shape as transfer_to_human (builtin-tools.ts:479-498), plus assignedAgentId +
 * assignedDepartmentId which transfer_to_human never sets.
 */
async function applyHandoffMutation(args: HandoffMutationArgs): Promise<void> {
  await database.chatSession.update({
    where: { id: args.sessionId },
    data: {
      // Assignment — the differentiator vs transfer_to_human.
      assignedDepartmentId: args.departmentId,
      assignedAgentId: args.assignedAgentId, // null on org-wide fallback
      // Pause AI — identical to transfer_to_human.
      aiEnabled: false,
      aiBlockReason: args.reason,
      pausedBy: 'agent',
      status: args.currentStatus === 'CLOSED' ? args.currentStatus : 'PAUSED',
      // Handoff record — same shape as transfer_to_human for uniform panel render.
      customFields: {
        ...args.existingCustomFields,
        handoff: {
          reason: args.reason,
          urgency: args.urgency,
          summary: args.summary,
          transferredAt: new Date().toISOString(),
          departmentId: args.departmentId,
          assignedAgentId: args.assignedAgentId,
          dispatchedVia: args.dispatchedVia,
          // 6A — whether the chosen member was reached via WhatsApp (audit only;
          // null when not attempted, e.g. queue fallback). The in-app
          // Notification is always created regardless, as the auditable floor.
          whatsappNotified: args.whatsappNotified ?? null,
        },
      } as Prisma.InputJsonValue,
      tags: { push: ['department_dispatch', ...args.extraTags] },
    },
  })
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

/**
 * Executes the dispatch_to_agent tool.
 *
 * Flow:
 *   1. Load the session (customFields, phone, status). Missing → failure.
 *   2. Run the roleta (selectNextMember) for the target department.
 *   3a. Department not found/inactive → success:false; the LLM is instructed to
 *       fall back to transfer_to_human (avoids an orphan conversation silently).
 *   3b. Empty pool → behave like transfer_to_human: pause + notify the WHOLE org
 *       (no assignedAgentId), dispatchedVia='queue'. Avoids orphan conversation.
 *   4. On success: assign department + chosen agent, pause AI, write handoff,
 *      and notify ONLY the chosen agent (Notification.userId).
 *
 * The agent does NOT message the customer from this tool — it confirms by text,
 * same convention as transfer_to_human / schedule_appointment.
 */
export async function executeDispatchToAgent(
  ctx: ToolExecutionContext,
  input: DispatchToAgentInput,
): Promise<DispatchToAgentResult> {
  const { departmentId, reason, summary, urgency } = input

  try {
    const session = await database.chatSession.findUnique({
      where: { id: ctx.sessionId },
      select: { customFields: true, contactPhone: true, status: true },
    })
    if (!session) {
      return { success: false, message: 'Sessão não encontrada.' }
    }

    const existing =
      (session.customFields as Record<string, unknown> | null) ?? {}

    // Round-robin selection (atomic select + cursor advance).
    const selection = await selectNextMember(departmentId, ctx.organizationId)

    // --- Fallback A: department unknown / inactive, or feature not yet -----
    //     provisioned (roleta migration not landed). Either way the LLM should
    //     fall back to transfer_to_human instead of leaving the lead orphaned.
    if (
      !selection.ok &&
      (selection.reason === 'department_not_found' ||
        selection.reason === 'feature_not_provisioned')
    ) {
      const why =
        selection.reason === 'feature_not_provisioned'
          ? 'Roleta de departamentos indisponível (não provisionada).'
          : 'Departamento não encontrado ou inativo.'
      return {
        success: false,
        departmentId,
        message: `${why} Use transfer_to_human para encaminhar manualmente.`,
      }
    }

    // --- Fallback B: empty pool → behave like transfer_to_human ------------
    if (!selection.ok && selection.reason === 'empty_pool') {
      await applyHandoffMutation({
        sessionId: ctx.sessionId,
        reason,
        urgency,
        summary: summary ?? null,
        departmentId,
        assignedAgentId: null,
        dispatchedVia: 'queue',
        existingCustomFields: existing,
        currentStatus: session.status,
        extraTags: ['human_handoff'],
      })

      // Notify the whole org (no specific agent available).
      await database.notification.create({
        data: {
          organizationId: ctx.organizationId,
          type: urgency === 'high' ? 'ERROR' : 'WARNING',
          title:
            urgency === 'high'
              ? 'Transferência urgente (departamento sem atendentes)'
              : 'Transferência para departamento (sem atendentes ativos)',
          description: `${session.contactPhone}: ${reason}`,
          source: 'ai-agent',
          sourceId: ctx.sessionId,
          actionUrl: `/conversations/${ctx.sessionId}`,
          actionLabel: 'Assumir conversa',
          metadata: {
            sessionId: ctx.sessionId,
            departmentId,
            urgency,
            summary: summary ?? null,
            dispatchedVia: 'queue',
            triggeredBy: 'dispatch_to_agent_tool',
          },
        },
      })

      return {
        success: true,
        departmentId,
        assignedAgentId: null,
        assignedAgentName: null,
        dispatchedVia: 'queue',
        message:
          'Departamento sem atendentes ativos. Conversa pausada e enviada para a fila geral.',
      }
    }

    // --- Success path: roleta picked a person -----------------------------
    // (TS narrowing: at this point selection.ok must be true.)
    if (!selection.ok) {
      // Unreachable, but keeps the type checker honest.
      return { success: false, message: 'Falha ao selecionar atendente.' }
    }

    const { chosen } = selection

    // The roleta may pick a "name + WhatsApp" member with NO userId (not a
    // platform user). assignedAgentId tolerates null; the in-app Notification
    // then falls into the org-wide shape (organizationId, no userId) so we never
    // build an invalid Notification.userId=null+org record.
    const assignedAgentId = chosen.userId ?? null

    await applyHandoffMutation({
      sessionId: ctx.sessionId,
      reason,
      urgency,
      summary: summary ?? null,
      departmentId,
      assignedAgentId,
      dispatchedVia: 'roulette',
      existingCustomFields: existing,
      currentStatus: session.status,
      extraTags: [],
    })

    // In-app Notification = the auditable FLOOR (always written, regardless of
    // the WhatsApp send below). When the chosen member is a platform user, notify
    // THAT person; when it's a "name + WhatsApp" member (no userId), fall back to
    // the org-wide shape so the org sees the assignment in the panel.
    const notifBase = {
      type: (urgency === 'high' ? 'ERROR' : 'WARNING') as 'ERROR' | 'WARNING',
      description: `${session.contactPhone}: ${reason}`,
      source: 'ai-agent',
      sourceId: ctx.sessionId,
      actionUrl: `/conversations/${ctx.sessionId}`,
      actionLabel: 'Assumir conversa',
      metadata: {
        sessionId: ctx.sessionId,
        departmentId,
        assignedAgentId,
        assignedMemberId: chosen.memberId,
        urgency,
        summary: summary ?? null,
        dispatchedVia: 'roulette',
        triggeredBy: 'dispatch_to_agent_tool',
      },
    }
    if (assignedAgentId) {
      await database.notification.create({
        data: {
          userId: assignedAgentId,
          title: 'Conversa atribuída a você',
          ...notifBase,
        },
      })
    } else {
      // Org-wide: the member has no platform user to target individually.
      await database.notification.create({
        data: {
          organizationId: ctx.organizationId,
          title: `Conversa atribuída a ${chosen.displayName} (atendente externo)`,
          ...notifBase,
        },
      })
    }

    // 6A — best-effort WhatsApp notification ON TOP of the in-app floor. NEVER
    // throws (the helper is fully fail-safe) and NEVER changes success/message:
    // the in-app Notification already guarantees the assignment is visible.
    let whatsappNotified = false
    try {
      const sendResult = await trySendRouletteWhatsApp({
        organizationId: ctx.organizationId,
        connectionId: ctx.connectionId,
        member: { whatsapp: chosen.whatsapp, displayName: chosen.displayName },
        contactPhone: session.contactPhone,
        reason,
        summary: summary ?? null,
        urgency,
      })
      whatsappNotified = sendResult.sent
    } catch (sendErr) {
      // Defensive: the helper is already fail-safe, but a throw here must NOT
      // derail the turn — the in-app Notification stands.
      console.warn(
        '[roulette-6A] envio falhou (ignored):',
        sendErr instanceof Error ? sendErr.message : String(sendErr),
      )
    }

    // Stamp the 6A audit flag into the handoff record (single targeted re-write of
    // customFields.handoff — same shape as applyHandoffMutation plus the flag).
    try {
      await database.chatSession.update({
        where: { id: ctx.sessionId },
        data: {
          customFields: {
            ...existing,
            handoff: {
              reason,
              urgency,
              summary: summary ?? null,
              transferredAt: new Date().toISOString(),
              departmentId,
              assignedAgentId,
              dispatchedVia: 'roulette',
              whatsappNotified,
            },
          } as Prisma.InputJsonValue,
        },
      })
    } catch (stampErr) {
      // Audit-only — never fail the dispatch over the flag write.
      console.warn(
        '[roulette-6A] carimbo whatsappNotified falhou (ignored):',
        stampErr instanceof Error ? stampErr.message : String(stampErr),
      )
    }

    return {
      success: true,
      departmentId,
      assignedAgentId,
      assignedAgentName: chosen.displayName,
      dispatchedVia: 'roulette',
      message: `Conversa atribuída a ${chosen.displayName} via roleta (urgência ${urgency}).`,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[dispatch_to_agent] Failed:', msg)
    return { success: false, message: `Erro ao encaminhar: ${msg}` }
  }
}

// ---------------------------------------------------------------------------
// Tool factory (spread into createBuiltinTools())
// ---------------------------------------------------------------------------

/**
 * Builds the dispatch_to_agent AI SDK tool bound to a session context.
 *
 * Wire it in builtin-tools.ts by spreading inside the createBuiltinTools()
 * return object:
 *
 *   import { createDispatchToAgentTool } from './department-dispatch/dispatch-to-agent'
 *   ...
 *   return {
 *     ...
 *     dispatch_to_agent: createDispatchToAgentTool(ctx),
 *   }
 */
export function createDispatchToAgentTool(ctx: ToolExecutionContext) {
  return tool({
    description:
      'Encaminha a conversa para um departamento específico e distribui automaticamente para o próximo atendente disponível via roleta (rodízio justo). Pausa a IA e atribui a conversa à pessoa sorteada. Use quando o cliente precisar de um setor específico (vendas, suporte) e você tiver o Department.id. Se não houver departamento adequado, use transfer_to_human.',
    inputSchema: dispatchToAgentInputSchema,
    execute: async (input) => executeDispatchToAgent(ctx, input),
  })
}
