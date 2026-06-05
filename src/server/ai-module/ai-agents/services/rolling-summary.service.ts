/**
 * Rolling Summary Service (Orayon — resumo incremental durante a sessão aberta)
 *
 * Complementa loadPreviousSessionSummary (sessão CLOSED anterior) e
 * loadContactMemory (perfil vitalício): mantém um resumo CURTO (2-3 bullets) da
 * sessão ATUAL, atualizado a cada N turnos. Quando o histórico bruto é podado
 * pela janela dinâmica/microcompact, o agente ainda lembra o fio da conversa.
 *
 * Redis: `agent:memory:rolling:{sessionId}` (string, TTL 24h) +
 *        `agent:memory:rollcount:{sessionId}` (INCR, TTL 24h).
 *
 * Fail-safe: sem Redis, sem LLM ou qualquer erro → no-op (update) / null (load).
 * Nunca lança, nunca bloqueia o turno.
 */

import type { Redis } from 'ioredis'
import { generateText } from 'ai'
import { getModel } from './provider-factory'
import { loadShortMemory } from './memory.service'

// ── Constants ────────────────────────────────────────────────────────────────

const ROLLING_PREFIX = 'agent:memory:rolling:'
const ROLLCOUNT_PREFIX = 'agent:memory:rollcount:'
const ROLLING_TTL = 86400 // 24h, alinhado com a short-memory

/** A cada N turnos, regenera o resumo rolling. */
const TURNS_PER_REFRESH = 10
/** Quantas mensagens recentes alimentam o resumo (~10 turnos user+assistant). */
const SUMMARY_INPUT_MESSAGES = 20
/** Mínimo de mensagens p/ valer a pena resumir. */
const MIN_MESSAGES_TO_SUMMARIZE = 4

/** Modelo barato: haiku via getModel; fallback gpt-4o-mini. */
const CHEAP_PROVIDER_ANTHROPIC = 'anthropic'
const CHEAP_MODEL_HAIKU = 'claude-3-5-haiku-20241022'
const CHEAP_PROVIDER_OPENAI = 'openai'
const CHEAP_MODEL_OPENAI = 'gpt-4o-mini'

const SUMMARY_MAX_OUTPUT_TOKENS = 220
const SUMMARY_MAX_CHARS = 600
const LANGUAGE = 'pt-BR'

// ── Internal helpers ─────────────────────────────────────────────────────────

function rollingKey(sessionId: string): string {
  return `${ROLLING_PREFIX}${sessionId}`
}

function rollcountKey(sessionId: string): string {
  return `${ROLLCOUNT_PREFIX}${sessionId}`
}

function buildSystemPrompt(): string {
  return (
    `Voce resume a conversa WhatsApp EM ANDAMENTO em 2 a 3 bullets curtos, em ${LANGUAGE}. ` +
    'Foque no que importa para continuar o atendimento agora: intencao do cliente, ' +
    'info ja coletada, pendencias e proximo passo. Sem saudacoes, sem preambulo. ' +
    'Responda APENAS os bullets.'
  )
}

function buildUserPrompt(
  messages: Array<{ role: string; content: string }>,
): string {
  const transcript = messages
    .map((m) => {
      const who = m.role === 'user' ? 'Cliente' : 'Agente'
      return `${who}: ${m.content}`
    })
    .join('\n')
  return `Conversa ate aqui:\n${transcript}\n\nResumo (2-3 bullets):`
}

/**
 * Modelo barato: haiku quando há key utilizável (ANTHROPIC_API_KEY/LiteLLM),
 * senão gpt-4o-mini. null quando não há key utilizável (sem LLM → degrada).
 */
function resolveCheapModel(): ReturnType<typeof getModel> | null {
  const hasAnthropic = Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.LITELLM_MASTER_KEY,
  )
  const hasOpenAI = Boolean(
    process.env.OPENAI_API_KEY || process.env.LITELLM_MASTER_KEY,
  )

  try {
    if (hasAnthropic) {
      return getModel(CHEAP_PROVIDER_ANTHROPIC, CHEAP_MODEL_HAIKU)
    }
    if (hasOpenAI) {
      return getModel(CHEAP_PROVIDER_OPENAI, CHEAP_MODEL_OPENAI)
    }
  } catch (err) {
    console.warn(
      '[rolling-summary] resolveCheapModel failed (ignored):',
      err instanceof Error ? err.message : err,
    )
  }
  return null
}

async function generateRollingSummary(
  messages: Array<{ role: string; content: string }>,
): Promise<string | null> {
  if (messages.length < MIN_MESSAGES_TO_SUMMARIZE) return null

  const model = resolveCheapModel()
  if (!model) return null

  try {
    const result = await generateText({
      model,
      system: buildSystemPrompt(),
      prompt: buildUserPrompt(messages),
      maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
    })
    const content = result.text?.trim()
    if (!content) return null
    return content.slice(0, SUMMARY_MAX_CHARS).trimEnd()
  } catch (err) {
    console.warn(
      '[rolling-summary] generate failed (ignored):',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Lê o resumo rolling da sessão. string ou null (sem rolling/Redis/erro). */
export async function loadRollingSummary(
  redis: Redis | null,
  sessionId: string,
): Promise<string | null> {
  if (!redis) return null
  try {
    const value = await redis.get(rollingKey(sessionId))
    return value && value.trim() ? value : null
  } catch (err) {
    console.warn(
      '[rolling-summary] load failed (ignored):',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

/**
 * Atualiza o resumo rolling — fire-and-forget após persistTurn. Incrementa o
 * contador de turnos e só regenera a cada `TURNS_PER_REFRESH` turnos (evita um
 * LLM barato por mensagem): lê as ~últimas SUMMARY_INPUT_MESSAGES da
 * short-memory, gera 2-3 bullets e salva (TTL 24h). Fail-safe: sem Redis/LLM ou
 * erro → no-op. `organizationId` exigido p/ multi-tenant (isolamento real vem
 * do sessionId já escopado à org pelo caller).
 */
export async function updateRollingSummary(
  redis: Redis | null,
  sessionId: string,
  organizationId: string,
): Promise<void> {
  if (!redis || !sessionId || !organizationId) return

  let count: number
  try {
    const key = rollcountKey(sessionId)
    count = await redis.incr(key)
    // Renova o TTL do contador a cada turno (segue a janela de 24h da sessão).
    await redis.expire(key, ROLLING_TTL)
  } catch (err) {
    console.warn(
      '[rolling-summary] rollcount incr failed (ignored):',
      err instanceof Error ? err.message : err,
    )
    return
  }

  // Só regenera no múltiplo de N turnos.
  if (count % TURNS_PER_REFRESH !== 0) return

  try {
    const recent = await loadShortMemory(
      redis,
      sessionId,
      SUMMARY_INPUT_MESSAGES,
    )
    if (recent.length < MIN_MESSAGES_TO_SUMMARIZE) return

    const summary = await generateRollingSummary(recent)
    if (!summary) return

    await redis.set(rollingKey(sessionId), summary, 'EX', ROLLING_TTL)
  } catch (err) {
    console.warn(
      '[rolling-summary] update failed (ignored):',
      err instanceof Error ? err.message : err,
    )
  }
}
