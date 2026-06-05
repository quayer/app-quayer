/**
 * session-close.job — encerra automaticamente ChatSession sem atividade
 * recente e dispara o resumo de longo prazo via summarizeSessionOnClose.
 *
 * Propósito: a long-term memory do agente (aiAgentContext.summary) depende de
 * uma chamada explícita ao fechar sessão. Como nem todo encerramento passa
 * pelo runtime do agente, este job percorre periodicamente sessões "frias"
 * (lastMessageAt > stalenessHours, sem summary persistido) e:
 *   1. Tenta gerar o summary (degrada para "sem summary" se OPENAI ausente).
 *   2. Marca status = CLOSED + closedAt = now.
 *
 * Idempotência: depois do primeiro run a sessão sai do filtro porque vira
 * CLOSED. Re-execução é segura: o findMany simplesmente não a retorna.
 *
 * Falha-segura: summarize pode falhar (OpenAI down, sem API key) — ainda
 * assim fechamos a sessão para que o próximo run não a reprocese.
 *
 * Quando rodar: a cada 5-15min via cron (BullMQ repeat, Vercel Cron, GitHub
 * Actions schedule, ou chamada manual de runSessionCloseBatch).
 *
 * Ver índices em ChatSession: lastMessageAt + status (otimização do filtro).
 */

import { Prisma, type PrismaClient } from '@prisma/client'

// Tipos mínimos do shape que usamos do Prisma — facilita mock em testes.
export type SessionClosePrismaLike = {
  chatSession: {
    findMany: PrismaClient['chatSession']['findMany']
    update: PrismaClient['chatSession']['update']
  }
}

export interface SessionCloseJobConfig {
  /** Horas sem atividade antes de considerar a sessão "stale". Default 24. */
  stalenessHours?: number
  /** Max de sessões por batch. Default 50. */
  batchSize?: number
  /** API key opcional repassada para o summarizer. */
  openaiApiKey?: string
}

export interface StaleSession {
  id: string
  contactPhone: string
}

export interface CloseStaleSessionResult {
  summarized: boolean
  closed: boolean
}

export interface SessionCloseBatchResult {
  processed: number
  summarized: number
  errors: number
}

const DEFAULT_STALENESS_HOURS = 24
const DEFAULT_BATCH_SIZE = 50

/**
 * Encontra sessões inativas que ainda não foram resumidas/fechadas.
 *
 * Filtro:
 *   - status != CLOSED
 *   - lastMessageAt < now - stalenessHours
 *   - aiAgentContext IS NULL (heurística simples e robusta: depois do summary
 *     persistido a sessão também vira CLOSED e sai do scope, então não
 *     precisamos navegar dentro do JSON para conferir summary)
 */
export async function findStaleSessions(
  database: SessionClosePrismaLike,
  config: SessionCloseJobConfig = {},
): Promise<StaleSession[]> {
  const stalenessHours = config.stalenessHours ?? DEFAULT_STALENESS_HOURS
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE

  const cutoff = new Date(Date.now() - stalenessHours * 60 * 60 * 1000)

  const rows = await database.chatSession.findMany({
    where: {
      status: { not: 'CLOSED' },
      lastMessageAt: { lt: cutoff },
      // Prisma exige sentinel especial para filtrar JSON IS NULL no DB.
      // DbNull = coluna nula no Postgres (diferente de JsonNull, que é o
      // literal JSON `null` armazenado).
      aiAgentContext: { equals: Prisma.DbNull },
    },
    select: { id: true, contactPhone: true },
    take: batchSize,
  })

  return rows as StaleSession[]
}

/**
 * Encontra sessões JÁ CLOSED que nunca ganharam summary (aiAgentContext IS
 * NULL). Cobre o gap do fechamento MANUAL: quando alguém encerra a sessão na
 * UI/DB direto, o status vira CLOSED mas nenhum summary é gerado, então o
 * filtro de findStaleSessions (status != CLOSED) nunca a pega. Aqui resumimos
 * sem reabrir/retocar closedAt — apenas persistimos a long-term memory.
 *
 * Idempotente: depois do summary persistido a sessão sai do scope (passa a ter
 * aiAgentContext). summarizeSessionOnClose também é no-op se já houver summary.
 */
export async function findClosedUnsummarizedSessions(
  database: SessionClosePrismaLike,
  config: SessionCloseJobConfig = {},
): Promise<StaleSession[]> {
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE

  const rows = await database.chatSession.findMany({
    where: {
      status: 'CLOSED',
      aiAgentContext: { equals: Prisma.DbNull },
    },
    select: { id: true, contactPhone: true },
    take: batchSize,
  })

  return rows as StaleSession[]
}

/**
 * Resume uma sessão JÁ fechada (manual close) sem alterar status/closedAt.
 * Fail-safe: nunca lança. Retorna se gerou summary.
 */
export async function summarizeClosedSession(
  sessionId: string,
  openaiApiKey?: string,
): Promise<boolean> {
  try {
    const mod = await import(
      '@/server/ai-module/ai-agents/services/session-summary.service'
    )
    return await mod.summarizeSessionOnClose(sessionId, openaiApiKey)
  } catch (err) {
    console.warn(
      '[session-close.job] summarizeClosedSession threw (ignored):',
      (err as Error)?.message ?? err,
    )
    return false
  }
}

/**
 * Fecha uma sessão individual:
 *   1. Tenta summarizeSessionOnClose (import dinâmico para evitar ciclo).
 *   2. Marca CLOSED + closedAt.
 *
 * Nunca dá throw — sempre devolve flags. O summarize pode falhar (sem API key,
 * erro de rede); ainda assim fechamos para não reprocessar.
 */
export async function closeStaleSession(
  database: SessionClosePrismaLike,
  sessionId: string,
  openaiApiKey?: string,
): Promise<CloseStaleSessionResult> {
  let summarized = false

  try {
    const mod = await import(
      '@/server/ai-module/ai-agents/services/session-summary.service'
    )
    summarized = await mod.summarizeSessionOnClose(sessionId, openaiApiKey)
  } catch (err) {
    // Logamos mas não propagamos — fechar a sessão é prioridade.
    console.warn(
      '[session-close.job] summarizeSessionOnClose threw, fechando assim mesmo:',
      (err as Error)?.message ?? err,
    )
    summarized = false
  }

  let closed = false
  try {
    await database.chatSession.update({
      where: { id: sessionId },
      data: { status: 'CLOSED', closedAt: new Date() },
    })
    closed = true
  } catch (err) {
    console.error(
      '[session-close.job] failed to mark session CLOSED:',
      sessionId,
      (err as Error)?.message ?? err,
    )
    closed = false
  }

  return { summarized, closed }
}

/**
 * Processa um batch completo. Erro individual não aborta o loop.
 *
 * Métricas:
 *   - processed: total tentado
 *   - summarized: quantos receberam summary persistido
 *   - errors: quantos falharam em fechar (não conta summarize falho)
 */
export async function runSessionCloseBatch(
  database: SessionClosePrismaLike,
  config: SessionCloseJobConfig = {},
): Promise<SessionCloseBatchResult> {
  const sessions = await findStaleSessions(database, config)

  let processed = 0
  let summarized = 0
  let errors = 0

  for (const s of sessions) {
    processed += 1
    try {
      const r = await closeStaleSession(database, s.id, config.openaiApiKey)
      if (r.summarized) summarized += 1
      if (!r.closed) errors += 1
    } catch (err) {
      // Em tese closeStaleSession já catch tudo, mas defensivo.
      console.error(
        '[session-close.job] unexpected error on session',
        s.id,
        (err as Error)?.message ?? err,
      )
      errors += 1
    }
  }

  // Gap do fechamento manual: sessões já CLOSED sem summary. Apenas resumimos
  // (não tocamos status/closedAt). Falha de summarize não conta como error de
  // fechamento — a sessão já está fechada.
  try {
    const closedPending = await findClosedUnsummarizedSessions(database, config)
    for (const s of closedPending) {
      processed += 1
      const ok = await summarizeClosedSession(s.id, config.openaiApiKey)
      if (ok) summarized += 1
    }
  } catch (err) {
    console.error(
      '[session-close.job] failed to process closed-unsummarized batch:',
      (err as Error)?.message ?? err,
    )
  }

  return { processed, summarized, errors }
}
