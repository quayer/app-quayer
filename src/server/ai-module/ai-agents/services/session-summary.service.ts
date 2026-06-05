/**
 * Session Summary Service
 *
 * Quando uma ChatSession fecha (status=CLOSED), gera resumo de até `maxWords`
 * palavras da conversa via OpenAI e persiste em `ChatSession.aiAgentContext`
 * (campo JSON). A próxima sessão do mesmo contato carrega o resumo no system
 * prompt do agente, dando continuidade sem reprocessar 100 mensagens.
 *
 * Inspirado em src/services/extractMemories/extractMemories.ts do Claude Code
 * leak (forked agent pattern).
 *
 * API:
 *  - summarizeSession(messages, options): chama OpenAI, retorna SessionSummary
 *    ou null em erro / conversa curta.
 *  - persistSessionSummary(db, sessionId, summary): persiste em aiAgentContext.
 *  - loadPreviousSessionSummary(db, phone, orgId, options?): lê última sessão
 *    CLOSED do mesmo contato.
 *  - summarizeSessionOnClose(sessionId): orquestrador idempotente — busca
 *    mensagens, resume com modelo barato (haiku → fallback OpenAI), persiste e
 *    agrega o ContactMemory. No-op se a sessão já tem summary. Fail-safe.
 */

import { generateText } from 'ai'
import { database } from '@/server/services/database'
import { getModel } from './provider-factory'

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_MAX_WORDS = 200
const DEFAULT_LANGUAGE = 'pt-BR'
const MIN_MESSAGES_TO_SUMMARIZE = 3
const OPENAI_MAX_TOKENS = 500

// summarizeSessionOnClose: modelo barato + limite de tamanho do resumo.
const CHEAP_PROVIDER_ANTHROPIC = 'anthropic'
const CHEAP_MODEL_HAIKU = 'claude-3-5-haiku-20241022'
const CHEAP_PROVIDER_OPENAI = 'openai'
const CHEAP_MODEL_OPENAI = 'gpt-4o-mini'
const ON_CLOSE_MAX_WORDS = 130
const ON_CLOSE_SUMMARY_MAX_CHARS = 600
const ON_CLOSE_MAX_OUTPUT_TOKENS = 320

// ── Types ────────────────────────────────────────────────────────────────────

export interface SessionSummary {
  summary: string
  generatedAt: string
  messageCount: number
  model: string
}

export interface SummarizeOptions {
  openaiApiKey: string
  model?: string
  maxWords?: number
  language?: string
}

interface ChatSessionUpdateArgs {
  where: { id: string }
  data: { aiAgentContext: unknown }
}

interface ChatSessionFindFirstArgs {
  where: {
    contactPhone: string
    organizationId: string
    status: string
    aiAgentContext: { not: null }
    id?: { not: string }
  }
  orderBy: { closedAt: 'asc' | 'desc' }
}

interface ChatSessionRow {
  id: string
  aiAgentContext: unknown
}

export interface PrismaLike {
  chatSession: {
    findFirst: (args: ChatSessionFindFirstArgs) => Promise<ChatSessionRow | null>
    update: (args: ChatSessionUpdateArgs) => Promise<unknown>
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function buildSystemPrompt(maxWords: number, language: string): string {
  return (
    `Voce resume conversas WhatsApp em ate ${maxWords} palavras em ${language}. ` +
    'Preserve: nome do cliente, intencao principal, decisoes, info coletada, status final.'
  )
}

function buildUserPrompt(
  messages: Array<{ role: string; content: string }>
): string {
  return messages
    .map((m) => {
      const who = m.role === 'user' ? 'Cliente' : 'Agente'
      return `${who}: ${m.content}`
    })
    .join('\n')
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>
}

/**
 * Type guard para o JSON `aiAgentContext` armazenado no banco.
 * Aceita qualquer objeto cujo campo `summary` aparente ser uma SessionSummary.
 */
function extractStoredSummary(raw: unknown): SessionSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const ctx = raw as Record<string, unknown>
  const candidate = ctx.summary
  if (!candidate || typeof candidate !== 'object') return null
  const s = candidate as Record<string, unknown>
  if (
    typeof s.summary === 'string' &&
    typeof s.generatedAt === 'string' &&
    typeof s.messageCount === 'number' &&
    typeof s.model === 'string'
  ) {
    return {
      summary: s.summary,
      generatedAt: s.generatedAt,
      messageCount: s.messageCount,
      model: s.model,
    }
  }
  return null
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Resume uma sessão de chat via OpenAI. Retorna null para conversas curtas
 * (< 3 mensagens) ou em qualquer erro da API.
 */
export async function summarizeSession(
  messages: Array<{ role: string; content: string }>,
  options: SummarizeOptions
): Promise<SessionSummary | null> {
  if (messages.length < MIN_MESSAGES_TO_SUMMARIZE) {
    return null
  }

  const model = options.model ?? DEFAULT_MODEL
  const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS
  const language = options.language ?? DEFAULT_LANGUAGE

  try {
    const response = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: OPENAI_MAX_TOKENS,
        messages: [
          { role: 'system', content: buildSystemPrompt(maxWords, language) },
          { role: 'user', content: buildUserPrompt(messages) },
        ],
      }),
    })

    if (!response.ok) {
      console.warn(
        `[session-summary] OpenAI returned ${response.status}; skipping summary`
      )
      return null
    }

    const json = (await response.json()) as OpenAIChatResponse
    const content = json.choices?.[0]?.message?.content?.trim()
    if (!content) {
      console.warn('[session-summary] OpenAI response had no content')
      return null
    }

    return {
      summary: content,
      generatedAt: new Date().toISOString(),
      messageCount: messages.length,
      model,
    }
  } catch (err) {
    console.warn(
      '[session-summary] summarize failed:',
      err instanceof Error ? err.message : err
    )
    return null
  }
}

/**
 * Persiste o resumo no campo aiAgentContext da ChatSession.
 * Salva como `{ summary: <SessionSummary> }` para deixar espaço a outros
 * campos de contexto no futuro.
 */
export async function persistSessionSummary(
  database: PrismaLike,
  sessionId: string,
  summary: SessionSummary
): Promise<boolean> {
  try {
    await database.chatSession.update({
      where: { id: sessionId },
      data: { aiAgentContext: { summary } },
    })
    return true
  } catch (err) {
    console.warn(
      '[session-summary] persist failed:',
      err instanceof Error ? err.message : err
    )
    return false
  }
}

/**
 * Lê o resumo da sessão CLOSED mais recente do mesmo contato/org.
 * Útil para injetar continuidade no system prompt da próxima sessão.
 */
export async function loadPreviousSessionSummary(
  database: PrismaLike,
  contactPhone: string,
  organizationId: string,
  options?: { excludeSessionId?: string }
): Promise<SessionSummary | null> {
  try {
    const where: ChatSessionFindFirstArgs['where'] = {
      contactPhone,
      organizationId,
      status: 'CLOSED',
      aiAgentContext: { not: null },
    }
    if (options?.excludeSessionId) {
      where.id = { not: options.excludeSessionId }
    }

    const row = await database.chatSession.findFirst({
      where,
      orderBy: { closedAt: 'desc' },
    })

    if (!row) return null
    return extractStoredSummary(row.aiAgentContext)
  } catch (err) {
    console.warn(
      '[session-summary] load failed:',
      err instanceof Error ? err.message : err
    )
    return null
  }
}

// ── summarizeSessionOnClose (orquestrador idempotente) ───────────────────────
//
// Único ponto que QUALQUER caminho de fechamento (job de inatividade OU
// encerramento manual via UI) deve chamar. Garante long-term memory mesmo
// quando a sessão é fechada à mão (o filtro do job só pega inativas).
//
// Idempotente: se aiAgentContext.summary já existe, é no-op (true) — re-rodar
// é seguro. Usa modelo barato (anthropic haiku → fallback OpenAI direto via
// fetch). Trunca o resumo a ~600 chars. Fail-safe: nunca lança, retorna false
// em qualquer falha para não derrubar o fechamento.

interface OnCloseSessionRow {
  id: string
  organizationId: string
  contactPhone: string
  aiAgentContext: unknown
}

async function generateCheapSummary(
  messages: Array<{ role: string; content: string }>,
): Promise<SessionSummary | null> {
  if (messages.length < MIN_MESSAGES_TO_SUMMARIZE) return null

  const hasAnthropic = Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.LITELLM_MASTER_KEY,
  )
  const provider = hasAnthropic ? CHEAP_PROVIDER_ANTHROPIC : CHEAP_PROVIDER_OPENAI
  const model = hasAnthropic ? CHEAP_MODEL_HAIKU : CHEAP_MODEL_OPENAI

  // Sem nenhuma key utilizável → tenta o caminho fetch/OpenAI clássico.
  if (!hasAnthropic && !process.env.OPENAI_API_KEY) return null

  try {
    const result = await generateText({
      model: getModel(provider, model),
      system: buildSystemPrompt(ON_CLOSE_MAX_WORDS, DEFAULT_LANGUAGE),
      prompt: buildUserPrompt(messages),
      maxOutputTokens: ON_CLOSE_MAX_OUTPUT_TOKENS,
    })
    const content = result.text?.trim()
    if (!content) return null
    return {
      summary: content.slice(0, ON_CLOSE_SUMMARY_MAX_CHARS).trimEnd(),
      generatedAt: new Date().toISOString(),
      messageCount: messages.length,
      model,
    }
  } catch (err) {
    console.warn(
      '[session-summary] cheap summarize failed, fallback to OpenAI fetch:',
      err instanceof Error ? err.message : err,
    )
    // Fallback: caminho fetch/OpenAI já testado.
    if (!process.env.OPENAI_API_KEY) return null
    const fallback = await summarizeSession(messages, {
      openaiApiKey: process.env.OPENAI_API_KEY,
      maxWords: ON_CLOSE_MAX_WORDS,
    })
    if (!fallback) return null
    return {
      ...fallback,
      summary: fallback.summary.slice(0, ON_CLOSE_SUMMARY_MAX_CHARS).trimEnd(),
    }
  }
}

export async function summarizeSessionOnClose(
  sessionId: string,
  _openaiApiKey?: string,
): Promise<boolean> {
  try {
    const session = (await database.chatSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        organizationId: true,
        contactPhone: true,
        aiAgentContext: true,
      },
    })) as OnCloseSessionRow | null

    if (!session) return false

    // Idempotência: já tem summary persistido → no-op.
    if (extractStoredSummary(session.aiAgentContext)) return true

    const rows = await database.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: { content: true, direction: true },
    })
    const formatted = rows.map((m) => ({
      role: m.direction === 'INBOUND' ? 'user' : 'assistant',
      content: m.content || '',
    }))

    const summary = await generateCheapSummary(formatted)
    if (!summary) return false

    const persisted = await persistSessionSummary(
      database as unknown as PrismaLike,
      sessionId,
      summary,
    )
    if (!persisted) return false

    // Agrega o ContactMemory (perfil vitalício). Dynamic import evita ciclo;
    // try/catch dedicado garante que falha de memória não derruba o fechamento.
    try {
      const mod = await import(
        '@/server/communication/services/contact-memory.service'
      )
      await mod.updateContactMemoryFromSummary(
        session.organizationId,
        session.contactPhone,
        summary.summary,
      )
    } catch (err) {
      console.warn(
        '[session-summary] contact-memory update failed (ignored):',
        err instanceof Error ? err.message : err,
      )
    }

    return true
  } catch (err) {
    console.warn(
      '[session-summary] summarizeSessionOnClose failed:',
      err instanceof Error ? err.message : err,
    )
    return false
  }
}
