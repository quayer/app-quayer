/**
 * Agent Runtime — summarize-on-close helper
 *
 * Extraído de `agent-runtime.service.ts` no split estrutural — comportamento
 * idêntico.
 */

import { database } from '@/server/services/database'
import {
  summarizeSession,
  persistSessionSummary,
  type PrismaLike as SessionSummaryPrismaLike,
} from '../services/session-summary.service'

// ── Summarize-on-close helper ──────────────────────────────────────────────
//
// Helper exportado para gerar e persistir o resumo de uma sessão recém-fechada.
// Pode ser chamado por:
//   - lifecycle hook quando ChatSession.status muda para CLOSED
//   - job em background (BullMQ)
//   - script administrativo via Claude Code
//
// Comportamento defensivo: sem OPENAI_API_KEY, retorna false e loga; falha de
// OpenAI/persist retorna false sem throw. Idempotente — re-rodar substitui o
// resumo anterior em aiAgentContext.

export async function summarizeSessionOnClose(
  sessionId: string,
  openaiApiKey?: string,
): Promise<boolean> {
  const apiKey = openaiApiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('[AgentRuntime] summarizeSessionOnClose: missing OPENAI_API_KEY')
    return false
  }

  // Buscar todas as messages da sessão em ordem cronológica.
  const messages = await database.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    select: { content: true, direction: true },
  })

  const formatted = messages.map((m) => ({
    role: m.direction === 'INBOUND' ? 'user' : 'assistant',
    content: m.content || '',
  }))

  const summary = await summarizeSession(formatted, { openaiApiKey: apiKey })
  if (!summary) return false

  return persistSessionSummary(
    database as unknown as SessionSummaryPrismaLike,
    sessionId,
    summary,
  )
}
