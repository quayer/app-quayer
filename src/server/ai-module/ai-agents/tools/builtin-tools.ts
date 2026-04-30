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
    // get_session_history
    // -----------------------------------------------------------------------
    get_session_history: tool({
      description:
        'Recupera o histórico de mensagens da sessão atual para contexto adicional. Retorna as mensagens em ordem cronológica (mais antigas primeiro).',
      inputSchema: z.object({
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(10)
          .describe('Número de mensagens para recuperar (1–50, padrão 10)'),
      }),
      execute: async (input) => {
        const { limit } = input

        const messages = await database.message.findMany({
          where: { sessionId: ctx.sessionId },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            content: true,
            direction: true,
            author: true,
            type: true,
            createdAt: true,
          },
        })

        return {
          success: true,
          // Reverse to chronological order (oldest first) for easier reading
          messages: messages.reverse(),
          count: messages.length,
        }
      },
    }),

    // -----------------------------------------------------------------------
    // notify_team (US-019) — create notification without pausing AI
    // -----------------------------------------------------------------------
    notify_team: tool({
      description:
        'Notifica equipe sobre lead qualificado ou situação importante, sem pausar IA',
      inputSchema: z.object({
        message: z.string().describe('Mensagem da notificação'),
        priority: z
          .enum(['low', 'medium', 'high'])
          .default('medium')
          .describe('Prioridade: low, medium ou high'),
      }),
      execute: async (input) => {
        const { message, priority } = input

        try {
          const notificationType =
            priority === 'high' ? 'WARNING' : 'INFO'

          const notification = await database.notification.create({
            data: {
              organizationId: ctx.organizationId,
              type: notificationType as 'WARNING' | 'INFO',
              title:
                priority === 'high'
                  ? 'Alerta do Agente IA (alta prioridade)'
                  : 'Notificação do Agente IA',
              description: message,
              source: 'ai-agent',
              sourceId: ctx.sessionId,
              actionUrl: `/conversations/${ctx.sessionId}`,
              actionLabel: 'Ver conversa',
              metadata: {
                sessionId: ctx.sessionId,
                contactId: ctx.contactId,
                priority,
                triggeredBy: 'notify_team_tool',
              },
            },
          })

          return {
            success: true,
            notificationId: notification.id,
            message: `Equipe notificada: "${message}"`,
          }
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : 'Erro desconhecido'
          console.error('[notify_team] Failed to create notification:', msg)
          return {
            success: false,
            message: `Erro ao notificar equipe: ${msg}`,
          }
        }
      },
    }),

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
    // transfer_to_human — pausa IA + escala para atendente humano
    // -----------------------------------------------------------------------
    // Efeito colateral: aiEnabled=false, aiBlockReason, pausedBy='agent',
    // cria notificação WARNING. O próximo operador online pega a sessão
    // pelo painel.
    transfer_to_human: tool({
      description:
        'Pausa a IA e transfere a conversa para um atendente humano. Use quando o cliente pedir para falar com uma pessoa, reclamar, ou quando a situação exigir julgamento humano.',
      inputSchema: z.object({
        reason: z
          .string()
          .min(10)
          .max(500)
          .describe(
            'Motivo da transferência (ex: "cliente insatisfeito com entrega")',
          ),
        urgency: z
          .enum(['low', 'medium', 'high'])
          .default('medium')
          .describe('Urgência: low (pode esperar), medium, high (imediato)'),
        summary: z
          .string()
          .max(800)
          .optional()
          .describe(
            'Resumo da conversa até agora para o humano pegar rápido.',
          ),
      }),
      execute: async (input) => {
        const { reason, urgency, summary } = input

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

          await database.chatSession.update({
            where: { id: ctx.sessionId },
            data: {
              aiEnabled: false,
              aiBlockReason: reason,
              pausedBy: 'agent',
              status:
                session.status === 'CLOSED' ? session.status : 'PAUSED',
              customFields: {
                ...existing,
                handoff: {
                  reason,
                  urgency,
                  summary: summary ?? null,
                  transferredAt: new Date().toISOString(),
                },
              } as Prisma.InputJsonValue,
              tags: { push: 'human_handoff' },
            },
          })

          await database.notification.create({
            data: {
              organizationId: ctx.organizationId,
              type: urgency === 'high' ? 'ERROR' : 'WARNING',
              title:
                urgency === 'high'
                  ? 'Transferência urgente para humano'
                  : 'Transferência para humano',
              description: `${session.contactPhone}: ${reason}`,
              source: 'ai-agent',
              sourceId: ctx.sessionId,
              actionUrl: `/conversations/${ctx.sessionId}`,
              actionLabel: 'Assumir conversa',
              metadata: {
                sessionId: ctx.sessionId,
                urgency,
                summary,
                triggeredBy: 'transfer_to_human_tool',
              },
            },
          })

          return {
            success: true,
            message: `Transferido para humano (${urgency}).`,
          }
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : 'Erro desconhecido'
          console.error('[transfer_to_human] Failed:', msg)
          return { success: false, message: `Erro ao transferir: ${msg}` }
        }
      },
    }),

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
  'get_session_history',
  'notify_team',
  'schedule_appointment',
  'send_pricing',
  'create_lead',
  'transfer_to_human',
]
