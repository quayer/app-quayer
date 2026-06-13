/**
 * Built-in Tools for AI Agents
 *
 * These tools are available to all AI agents in the Quayer platform.
 * Each tool uses Vercel AI SDK v6's tool() helper with Zod inputSchema.
 *
 * API shape (AI SDK v6):
 *   tool({ description, inputSchema: z.object({...}), execute: async (input) => ... })
 *
 * Tool naming follows snake_case to match AI provider function-calling
 * conventions (OpenAI, Anthropic tool_use, Google Gemini).
 */

import { tool } from 'ai'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { database } from '@/server/services/database'
import {
  createCheckAvailabilityTool,
  createCreateEventTool,
  createCancelEventTool,
  createListSlotsTool,
} from './calendar'
import { createGetPricingTool } from './pricing'
import { createEnrichInstagramTool } from './instagram'
import { createSearchKnowledgeTool } from './knowledge-search.tool'
import { createSearchMediaTool } from './media-search.tool'
import { createCalculatorTool } from './calculator.tool'
import { createThinkTool } from './think.tool'
import { createTransferToHumanTool } from './transfer-to-human.tool'
import { enqueueScheduledMessage } from '@/server/services/jobs/scheduled-message.queue'
import { resolveScheduledAt } from './followup/resolve-scheduled-at'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * Runtime context injected into every tool execution.
 * Bound once per message turn via createBuiltinTools().
 *
 * - sessionId      — active ChatSession.id
 * - contactId      — Contact.id for the session participant
 * - connectionId   — Connection.id (WhatsApp instance)
 * - organizationId — Organization.id (tenant boundary)
 * - systemUserId   — Optional User.id used as SessionNote.authorId.
 *                    When absent, schedule_callback falls back to a lookup
 *                    of the first admin/owner in the organization.
 * - agentConfigId  — Optional AIAgentConfig.id for the active agent
 */
export interface ToolExecutionContext {
  sessionId: string
  contactId: string
  connectionId: string
  organizationId: string
  /** Optional: valid User.id for session notes. Resolved lazily if not provided. */
  systemUserId?: string
  /** Optional: AIAgentConfig.id — needed by create_followup */
  agentConfigId?: string
  /**
   * Optional: knowledge collection id (AIAgentConfig.ragCollectionId quando
   * useRAG). Habilita a tool search_knowledge a reconsultar a base sob demanda.
   */
  ragCollectionId?: string | null
  /**
   * Optional: department id (AIAgentConfig.departmentId). Vínculo ESTRUTURADO
   * agente↔departamento. O dispatch_to_agent usa como FALLBACK quando o LLM
   * não passa um departmentId válido (robusto a qual prompt vence).
   */
  agentDepartmentId?: string | null
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a map of all built-in tools bound to a specific session context.
 * Call once per message turn to get tools scoped to the right tenant/session.
 */
export function createBuiltinTools(ctx: ToolExecutionContext) {
  return {
    // -----------------------------------------------------------------------
    // schedule_appointment — captura intenção de agendamento na sessão
    // -----------------------------------------------------------------------
    // Efeito colateral: grava appointment em session.customFields, cria
    // notificação para equipe. Não envia mensagem ao cliente — o agente
    // confirma via texto. Dedupe: se já existe appointment não confirmado,
    // atualiza em vez de duplicar.
    schedule_appointment: tool({
      description:
        'Registra um agendamento combinado com o cliente (data, horário, serviço). Use quando o cliente confirmar um horário. Não envie confirmação — o agente responde por texto.',
      inputSchema: z.object({
        date: z
          .string()
          .describe('Data no formato ISO (YYYY-MM-DD) ou ISO completo'),
        time: z
          .string()
          .optional()
          .describe('Horário no formato HH:mm se não estiver em `date`'),
        service: z
          .string()
          .min(2)
          .max(120)
          .describe('Serviço ou motivo do agendamento (ex: "corte + barba")'),
        notes: z
          .string()
          .max(500)
          .optional()
          .describe('Observações adicionais (ex: preferências do cliente)'),
      }),
      execute: async (input) => {
        const { date, time, service, notes } = input

        try {
          const session = await database.chatSession.findUnique({
            where: { id: ctx.sessionId },
            select: { customFields: true, contactPhone: true },
          })
          if (!session) {
            return { success: false, message: 'Sessão não encontrada.' }
          }

          const existing =
            (session.customFields as Record<string, unknown> | null) ?? {}
          const appointmentId = `appt_${Date.now()}`
          const appointment = {
            id: appointmentId,
            date,
            time: time ?? null,
            service,
            notes: notes ?? null,
            createdAt: new Date().toISOString(),
            status: 'pending_confirmation',
          }

          await database.chatSession.update({
            where: { id: ctx.sessionId },
            data: {
              customFields: {
                ...existing,
                lastAppointment: appointment,
                appointments: [
                  ...((existing.appointments as unknown[]) ?? []),
                  appointment,
                ],
              } as Prisma.InputJsonValue,
              tags: { push: 'appointment_scheduled' },
            },
          })

          await database.notification.create({
            data: {
              organizationId: ctx.organizationId,
              type: 'INFO',
              title: 'Novo agendamento',
              description: `${service} — ${date}${time ? ` ${time}` : ''} (${session.contactPhone})`,
              source: 'ai-agent',
              sourceId: ctx.sessionId,
              actionUrl: `/conversations/${ctx.sessionId}`,
              actionLabel: 'Ver conversa',
              metadata: {
                sessionId: ctx.sessionId,
                appointmentId,
                triggeredBy: 'schedule_appointment_tool',
              },
            },
          })

          return {
            success: true,
            appointmentId,
            message: `Agendamento registrado: ${service} em ${date}${time ? ` ${time}` : ''}.`,
          }
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : 'Erro desconhecido'
          console.error('[schedule_appointment] Failed:', msg)
          return { success: false, message: `Erro ao registrar: ${msg}` }
        }
      },
    }),

    // -----------------------------------------------------------------------
    // send_pricing — marca interesse em preços + retorna contexto
    // -----------------------------------------------------------------------
    // Read-mostly: registra que o cliente pediu preços (analytics) e
    // retorna os items passados. O texto com a tabela fica a cargo do
    // agente — esta tool apenas marca o evento para o CRM/analytics.
    send_pricing: tool({
      description:
        'Registra que o cliente solicitou preços de um serviço/produto. Use quando enviar valores. Passe os items que você vai mencionar para que fiquem registrados no CRM.',
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              name: z.string().describe('Nome do serviço/produto'),
              price: z
                .union([z.string(), z.number()])
                .describe('Valor (ex: 50, "50,00", "a partir de R$ 100")'),
              note: z
                .string()
                .optional()
                .describe('Nota opcional (ex: "com desconto à vista")'),
            }),
          )
          .min(1)
          .max(20)
          .describe('Items de preço que serão enviados ao cliente'),
      }),
      execute: async (input) => {
        const { items } = input

        try {
          const session = await database.chatSession.findUnique({
            where: { id: ctx.sessionId },
            select: { customFields: true },
          })
          if (!session) {
            return { success: false, message: 'Sessão não encontrada.' }
          }

          const existing =
            (session.customFields as Record<string, unknown> | null) ?? {}

          await database.chatSession.update({
            where: { id: ctx.sessionId },
            data: {
              customFields: {
                ...existing,
                lastPricingQuote: {
                  items,
                  sentAt: new Date().toISOString(),
                },
                pricingRequestCount:
                  ((existing.pricingRequestCount as number) ?? 0) + 1,
              } as Prisma.InputJsonValue,
              tags: { push: 'pricing_requested' },
            },
          })

          return {
            success: true,
            items,
            message: `Preços registrados (${items.length} item${items.length > 1 ? 's' : ''}).`,
          }
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : 'Erro desconhecido'
          console.error('[send_pricing] Failed:', msg)
          return { success: false, message: `Erro ao registrar: ${msg}` }
        }
      },
    }),

    // -----------------------------------------------------------------------
    // create_lead — marca sessão como lead qualificado + notifica equipe
    // -----------------------------------------------------------------------
    // Efeito colateral: atualiza leadScore, journeyStage='qualified',
    // customerJourney='qualified', adiciona tag, notifica vendas.
    create_lead: tool({
      description:
        'Marca o cliente como lead qualificado quando demonstra interesse sério (pediu proposta, pretende comprar, pediu contato de vendedor). Notifica a equipe automaticamente.',
      inputSchema: z.object({
        reason: z
          .string()
          .min(10)
          .max(500)
          .describe('Motivo do score (ex: "pediu proposta de 10 licenças")'),
        interest: z
          .string()
          .max(200)
          .optional()
          .describe('O que o cliente quer (ex: "plano anual enterprise")'),
        score: z
          .number()
          .min(0)
          .max(100)
          .default(80)
          .describe(
            'Score de 0-100. Use 60-80 para lead morno, 80+ para quente.',
          ),
        budget: z
          .string()
          .max(120)
          .optional()
          .describe('Orçamento mencionado (ex: "R$ 500/mês")'),
      }),
      execute: async (input) => {
        const { reason, interest, score, budget } = input

        try {
          const session = await database.chatSession.findUnique({
            where: { id: ctx.sessionId },
            select: { customFields: true, contactPhone: true },
          })
          if (!session) {
            return { success: false, message: 'Sessão não encontrada.' }
          }

          const existing =
            (session.customFields as Record<string, unknown> | null) ?? {}

          await database.chatSession.update({
            where: { id: ctx.sessionId },
            data: {
              leadScore: score,
              customerJourney: 'qualified',
              journeyStage: 'qualified',
              journeyUpdatedAt: new Date(),
              customFields: {
                ...existing,
                leadQualification: {
                  reason,
                  interest: interest ?? null,
                  budget: budget ?? null,
                  score,
                  qualifiedAt: new Date().toISOString(),
                },
              } as Prisma.InputJsonValue,
              tags: { push: 'lead_qualified' },
            },
          })

          await database.notification.create({
            data: {
              organizationId: ctx.organizationId,
              type: score >= 80 ? 'WARNING' : 'INFO',
              title:
                score >= 80
                  ? 'Lead quente qualificado'
                  : 'Lead qualificado',
              description: `${session.contactPhone}: ${reason}${interest ? ` (quer: ${interest})` : ''}`,
              source: 'ai-agent',
              sourceId: ctx.sessionId,
              actionUrl: `/conversations/${ctx.sessionId}`,
              actionLabel: 'Ver conversa',
              metadata: {
                sessionId: ctx.sessionId,
                score,
                interest,
                budget,
                triggeredBy: 'create_lead_tool',
              },
            },
          })

          return {
            success: true,
            leadScore: score,
            message: `Lead qualificado registrado (score ${score}).`,
          }
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : 'Erro desconhecido'
          console.error('[create_lead] Failed:', msg)
          return { success: false, message: `Erro ao qualificar lead: ${msg}` }
        }
      },
    }),

    // -----------------------------------------------------------------------
    // create_followup — agenda um envio PROATIVO atrasado (follow-up) TPRO-01.
    // -----------------------------------------------------------------------
    // Cria um ScheduledMessage (status='pending') org/contato-scoped a partir do
    // ctx e ENFILEIRA na fila scheduled-message com delay até scheduledAt.
    // NÃO ENVIA: o worker de ENVIO é F2b (depende do FSM-outbound durável) e
    // reavalia elegibilidade com estado fresco (opt-out/janela 24h/supressão/
    // anti-spam) no momento do disparo. Aqui só agendamos.
    create_followup: tool({
      description:
        'Agenda uma mensagem de follow-up proativa para o cliente em um momento futuro (ex: lembrar de retornar, confirmar interesse). NÃO envia agora — apenas agenda. Use scheduledAt como ISO (YYYY-MM-DDTHH:mm:ssZ) ou offset relativo (+2h, +30m, +1d).',
      inputSchema: z.object({
        reason: z
          .string()
          .min(3)
          .max(300)
          .describe(
            'Motivo do follow-up (ex: "cliente ia pensar no orçamento")',
          ),
        scheduledAt: z
          .string()
          .min(1)
          .describe(
            'Quando enviar: ISO completo (2026-06-14T09:00:00Z) ou offset relativo a agora (+2h, +30m, +1d).',
          ),
        messageGoal: z
          .string()
          .max(500)
          .optional()
          .describe(
            'O que a mensagem deve buscar (ex: "perguntar se decidiu sobre o plano")',
          ),
        maxAttempts: z
          .number()
          .int()
          .min(1)
          .max(5)
          .default(1)
          .describe('Máximo de tentativas de follow-up (default 1).'),
        cancelIfCustomerReplies: z
          .boolean()
          .default(true)
          .describe(
            'Cancela o follow-up se o cliente responder antes do horário (default true).',
          ),
      }),
      execute: async (input) => {
        const { reason, scheduledAt, messageGoal, maxAttempts, cancelIfCustomerReplies } =
          input

        try {
          const now = new Date()
          const resolved = resolveScheduledAt(scheduledAt, now)
          if (!resolved) {
            return {
              success: false,
              message:
                'Horário inválido. Use ISO futuro (2026-06-14T09:00:00Z) ou offset (+2h, +30m, +1d).',
            }
          }

          // contactPhone não vem no ctx — resolve da sessão (mesma origem
          // autoritativa que schedule_appointment usa). Org-scoped pelo ctx.
          const session = await database.chatSession.findUnique({
            where: { id: ctx.sessionId },
            select: { contactPhone: true },
          })
          if (!session?.contactPhone) {
            return {
              success: false,
              message: 'Sessão não encontrada ou sem telefone do contato.',
            }
          }

          const scheduled = await database.scheduledMessage.create({
            data: {
              organizationId: ctx.organizationId,
              // Follow-up ad-hoc (não vem de ScheduledAutomation).
              automationId: null,
              connectionId: ctx.connectionId,
              contactPhone: session.contactPhone,
              sessionId: ctx.sessionId,
              scheduledAt: resolved.at,
              reason,
              messageGoal: messageGoal ?? null,
              maxAttempts,
              cancelIfCustomerReplies,
              // status default 'pending', attemptsSoFar default 0 no schema.
            },
            select: { id: true },
          })

          // Enfileira com delay até scheduledAt. NÃO envia (worker = F2b). O
          // producer é fail-safe: sem Redis não derruba o turno — o registro
          // pending já está persistido e pode ser reenfileirado depois.
          const enqueue = await enqueueScheduledMessage(
            {
              scheduledMessageId: scheduled.id,
              organizationId: ctx.organizationId,
              connectionId: ctx.connectionId,
              contactPhone: session.contactPhone,
              sessionId: ctx.sessionId,
              scheduledAt: resolved.at.toISOString(),
              reason,
            },
            { delayMs: resolved.delayMs },
          )

          return {
            success: true,
            scheduledMessageId: scheduled.id,
            scheduledAt: resolved.at.toISOString(),
            enqueued: enqueue.enqueued,
            message: `Follow-up agendado para ${resolved.at.toISOString()}.`,
          }
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : 'Erro desconhecido'
          console.error('[create_followup] Failed:', msg)
          return { success: false, message: `Erro ao agendar follow-up: ${msg}` }
        }
      },
    }),

    // -----------------------------------------------------------------------
    // transfer_to_human — UNIFICADA: routing queue|department|self + pauseAI.
    // Consolidou os antigos notify_team (routing:queue,pauseAI:false) e
    // dispatch_to_agent (routing:department → delega à roleta madura via
    // executeDispatchToAgent). Ver transfer-to-human.tool.ts.
    // -----------------------------------------------------------------------
    transfer_to_human: createTransferToHumanTool(ctx),

    // Google Calendar (Wave 4b) — degradam ("agenda não conectada") até o
    // profissional conectar a agenda pelo link.
    check_availability: createCheckAvailabilityTool(ctx),
    create_event: createCreateEventTool(ctx),
    cancel_event: createCancelEventTool(ctx),

    // calendar_list_slots — lista horários livres dos próximos dias já dentro do
    // expediente (conveniência sobre check_availability; sem montar datas ISO).
    calendar_list_slots: createListSlotsTool(ctx),

    // get_pricing — consulta o catálogo de preços real (PriceList/PriceItem).
    // Degrada ("catálogo não configurado") até o profissional preencher a lista.
    get_pricing: createGetPricingTool(ctx),

    // enrich_instagram — busca perfil público do IG via Apify (bio/seguidores/
    // posts) p/ enriquecer o lead. Degrada se APIFY_TOKEN ausente.
    enrich_instagram: createEnrichInstagramTool(ctx),

    // -----------------------------------------------------------------------
    // search_knowledge — RAG sob demanda (complementa a injeção automática)
    // -----------------------------------------------------------------------
    search_knowledge: createSearchKnowledgeTool(ctx),

    // -----------------------------------------------------------------------
    // buscar_media — RETRIEVAL do catálogo de mídia (foto/vídeo/PDF). Devolve
    // URLs REAIS ao LLM para emitir a tag de mídia no outbound. NUNCA envia
    // (quem envia é o pipeline outbound). Degrada ("catálogo não configurado")
    // quando o agente não tem ragCollectionId.
    // -----------------------------------------------------------------------
    buscar_media: createSearchMediaTool(ctx),

    // -----------------------------------------------------------------------
    // calculator — aritmética exata (parcelas/descontos/%). Pura, sem ctx.
    // think — scratchpad de raciocínio (máx 3/turno). Sem efeito colateral.
    // Criadas por turno (contador do think reseta a cada createBuiltinTools).
    // -----------------------------------------------------------------------
    calculator: createCalculatorTool(),
    think: createThinkTool(),

  }
}

// ---------------------------------------------------------------------------
// Selective tool loading
// ---------------------------------------------------------------------------

/**
 * Returns only the tools whose names are present in the enabledTools array.
 * Use this to honour per-agent tool restrictions defined in AIAgentConfig.
 *
 * @param enabledTools - list of tool names allowed for the agent (from DB config)
 * @param ctx          - session execution context
 */
export function getEnabledBuiltinTools(
  enabledTools: string[],
  ctx: ToolExecutionContext,
): Record<string, ReturnType<typeof createBuiltinTools>[BuiltinToolName]> {
  const allTools = createBuiltinTools(ctx)
  const filtered: Record<string, ReturnType<typeof createBuiltinTools>[BuiltinToolName]> = {}

  for (const name of enabledTools) {
    if (name in allTools) {
      filtered[name] = allTools[name as BuiltinToolName]
    }
  }

  return filtered
}

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/** Union of all built-in tool names — useful for Zod schema validation */
export type BuiltinToolName = keyof ReturnType<typeof createBuiltinTools>

/** Ordered list of all available built-in tool names */
export const BUILTIN_TOOL_NAMES: BuiltinToolName[] = [
  'schedule_appointment',
  'send_pricing',
  'create_lead',
  'create_followup',
  'transfer_to_human',
  'check_availability',
  'create_event',
  'cancel_event',
  'get_pricing',
  'enrich_instagram',
  'search_knowledge',
  'buscar_media',
  'calendar_list_slots',
  'calculator',
  'think',
]
