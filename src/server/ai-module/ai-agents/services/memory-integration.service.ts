/**
 * Memory Integration Helper
 *
 * Wrapper sobre memory.service para uso pelo agent-runtime:
 *  - loadMemoryForAgent: carrega histórico (Redis fast path → Postgres fallback)
 *  - persistTurn: empurra user + assistant turn no Redis (fire-and-forget)
 *
 * Tolerante a Redis null (modo degradado): cai para Postgres no load,
 * no-op no persist.
 */

import type { Redis } from 'ioredis'
import { loadShortMemory, pushToShortMemory } from './memory.service'
import { updateRollingSummary } from './rolling-summary.service'

// ── types ────────────────────────────────────────────────────────────────────

export type MemoryRole = 'user' | 'assistant'

export interface MemoryMessage {
  role: MemoryRole
  content: string
}

interface PrismaMessageRow {
  content: string | null
  direction: string
}

interface PrismaLike {
  message: {
    findMany: (args: {
      where: { sessionId: string }
      orderBy: { createdAt: 'asc' | 'desc' }
      take: number
      select: { content: true; direction: true }
    }) => Promise<PrismaMessageRow[]>
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseRole(role: string): MemoryRole {
  return role === 'user' || role === 'INBOUND' ? 'user' : 'assistant'
}

function mapRedisEntry(entry: { role: string; content: string }): MemoryMessage {
  return { role: normaliseRole(entry.role), content: entry.content }
}

async function loadFromPostgres(
  database: PrismaLike,
  sessionId: string,
  memoryWindow: number
): Promise<MemoryMessage[]> {
  const rows = await database.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: memoryWindow,
    select: { content: true, direction: true },
  })
  return rows.map((r) => ({
    role: r.direction === 'INBOUND' ? 'user' : 'assistant',
    content: r.content ?? '',
  }))
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Carrega histórico para o agente.
 *  1) Tenta Redis (fast path). Erros caem para Postgres.
 *  2) Se Redis vazio (ou null/erro): consulta Postgres (Message table).
 *  3) Sempre limita ao `memoryWindow`.
 */
export async function loadMemoryForAgent(
  redis: Redis | null,
  database: PrismaLike,
  sessionId: string,
  memoryWindow: number
): Promise<MemoryMessage[]> {
  // Redis path
  if (redis) {
    try {
      const fromRedis = await loadShortMemory(redis, sessionId, memoryWindow)
      if (fromRedis.length > 0) {
        return fromRedis.slice(-memoryWindow).map(mapRedisEntry)
      }
    } catch (err) {
      console.warn(
        '[memory-integration] Redis load failed, falling back to Postgres:',
        err instanceof Error ? err.message : err
      )
    }
  }

  // Postgres fallback
  try {
    const fromPg = await loadFromPostgres(database, sessionId, memoryWindow)
    return fromPg.slice(-memoryWindow)
  } catch (err) {
    console.warn(
      '[memory-integration] Postgres load failed:',
      err instanceof Error ? err.message : err
    )
    return []
  }
}

/**
 * Persiste mensagem do user e resposta do assistant no Redis (TTL 24h).
 * Fire-and-forget: erros geram warning mas não jogam.
 * Redis null → no-op silencioso.
 *
 * Quando `organizationId` é informado, dispara (fire-and-forget) a atualização
 * do rolling summary da sessão — resumo incremental que sobrevive à poda da
 * janela dinâmica. Não bloqueia o turno: o void garante que não esperamos o LLM
 * barato, e o próprio service é fail-safe.
 */
export async function persistTurn(
  redis: Redis | null,
  sessionId: string,
  userMessage: string,
  assistantResponse: string,
  organizationId?: string
): Promise<void> {
  if (!redis) return

  try {
    await pushToShortMemory(redis, sessionId, {
      role: 'user',
      content: userMessage,
    })
    await pushToShortMemory(redis, sessionId, {
      role: 'assistant',
      content: assistantResponse,
    })
  } catch (err) {
    console.warn(
      '[memory-integration] persistTurn failed:',
      err instanceof Error ? err.message : err
    )
  }

  // Rolling summary (Orayon): só quando temos org (multi-tenant). Fire-and-forget
  // — não bloqueia o turno e degrada sozinho se Redis/LLM falharem.
  if (organizationId) {
    void updateRollingSummary(redis, sessionId, organizationId)
  }
}
