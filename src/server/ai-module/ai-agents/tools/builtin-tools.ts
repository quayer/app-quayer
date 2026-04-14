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
]
