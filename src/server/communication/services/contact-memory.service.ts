/**
 * Contact Memory Service
 *
 * Perfil vitalício do contato (por organização + telefone). Enquanto
 * ChatSession.aiAgentContext.summary guarda o resumo de UMA sessão,
 * ContactMemory.aggregatedProfile é um perfil CUMULATIVO de todas as sessões
 * fechadas: "quem é o cliente, o que quer, histórico".
 *
 * Fluxo: ao fechar+resumir uma sessão, session-summary.service chama
 * updateContactMemoryFromSummary(org, phone, novoResumo). Pegamos o perfil
 * atual + o resumo novo e pedimos a um LLM barato (anthropic haiku, fallback
 * OpenAI) para montar/atualizar um perfil curto. Upsert + incrementa
 * sessionCount.
 *
 * Injeção: prepareAgentCall (agent-runtime) lê loadContactMemory e injeta o
 * perfil no system prompt ("## Perfil do cliente").
 *
 * Multi-tenant: SEMPRE filtra por organizationId. Fail-safe: nenhuma função
 * lança — falha de LLM/DB degrada para no-op (memória nunca derruba o
 * fechamento nem o agente).
 *
 * API:
 *   - loadContactMemory(org, phone): perfil atual ou null.
 *   - updateContactMemoryFromSummary(org, phone, summary): agrega + upsert.
 */

import { generateText } from 'ai'
import { database } from '@/server/services/database'
import { getModel } from '@/server/ai-module/ai-agents/services/provider-factory'

// ── Constants ──────────────────────────────────────────────────────────────

const PROFILE_MAX_CHARS = 800
const LLM_MAX_OUTPUT_TOKENS = 400
const HAIKU_PROVIDER = 'anthropic'
const HAIKU_MODEL = 'claude-3-5-haiku-20241022'
const OPENAI_PROVIDER = 'openai'
const OPENAI_MODEL = 'gpt-4o-mini'

const AGGREGATION_SYSTEM_PROMPT =
  'Voce mantem o perfil vitalicio de um cliente de WhatsApp em portugues. ' +
  'Recebe o PERFIL ATUAL (pode estar vazio) e o RESUMO da sessao mais recente. ' +
  'Produza um perfil curto e atualizado (no maximo 6 linhas) com: quem e o ' +
  'cliente (nome se houver), o que ele quer/precisa, decisoes e fatos ' +
  'relevantes, e o historico resumido. Funda informacoes repetidas, prefira o ' +
  'mais recente em caso de conflito. Responda APENAS com o perfil, sem ' +
  'comentarios nem cabecalhos.'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ContactMemoryProfile {
  aggregatedProfile: string
  sessionCount: number
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trimEnd()
}

function buildAggregationPrompt(currentProfile: string, newSummary: string): string {
  const current = currentProfile.trim() || '(vazio — primeiro contato)'
  return `PERFIL ATUAL:\n${current}\n\nRESUMO DA SESSAO MAIS RECENTE:\n${newSummary.trim()}`
}

/**
 * Chama o LLM barato (haiku) para fundir perfil + resumo. Fallback OpenAI se a
 * key Anthropic não estiver disponível. Retorna null em qualquer erro.
 */
async function generateAggregatedProfile(
  currentProfile: string,
  newSummary: string,
): Promise<string | null> {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY || process.env.LITELLM_MASTER_KEY)
  const provider = hasAnthropic ? HAIKU_PROVIDER : OPENAI_PROVIDER
  const model = hasAnthropic ? HAIKU_MODEL : OPENAI_MODEL

  try {
    const result = await generateText({
      model: getModel(provider, model),
      system: AGGREGATION_SYSTEM_PROMPT,
      prompt: buildAggregationPrompt(currentProfile, newSummary),
      maxOutputTokens: LLM_MAX_OUTPUT_TOKENS,
    })
    const text = result.text?.trim()
    return text ? truncate(text, PROFILE_MAX_CHARS) : null
  } catch (err) {
    console.warn(
      '[contact-memory] LLM aggregation failed:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Lê o perfil vitalício do contato (org + telefone). Null se não existir ou em
 * erro. Usado para injeção no system prompt do agente.
 */
export async function loadContactMemory(
  organizationId: string,
  contactPhone: string,
): Promise<ContactMemoryProfile | null> {
  if (!organizationId || !contactPhone) return null
  try {
    const row = await database.contactMemory.findUnique({
      where: {
        organizationId_contactPhone: { organizationId, contactPhone },
      },
      select: { aggregatedProfile: true, sessionCount: true },
    })
    if (!row || !row.aggregatedProfile.trim()) return null
    return {
      aggregatedProfile: row.aggregatedProfile,
      sessionCount: row.sessionCount,
    }
  } catch (err) {
    console.warn(
      '[contact-memory] load failed:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

/**
 * Agrega o resumo de uma sessão recém-fechada no perfil vitalício do contato.
 * Idempotência prática: cada fechamento incrementa sessionCount uma vez; chamar
 * de novo com o mesmo resumo só re-funde (sem duplicar fatos, o LLM dedup).
 *
 * Fail-safe: retorna false em qualquer falha (LLM, DB) sem lançar.
 */
export async function updateContactMemoryFromSummary(
  organizationId: string,
  contactPhone: string,
  newSummary: string,
): Promise<boolean> {
  if (!organizationId || !contactPhone || !newSummary?.trim()) return false

  try {
    const existing = await database.contactMemory.findUnique({
      where: {
        organizationId_contactPhone: { organizationId, contactPhone },
      },
      select: { aggregatedProfile: true },
    })

    const aggregated = await generateAggregatedProfile(
      existing?.aggregatedProfile ?? '',
      newSummary,
    )

    // Sem LLM: degrada para o resumo cru truncado (melhor que nada no primeiro
    // contato; em updates mantém o perfil antigo para não perder histórico).
    const profile =
      aggregated ?? existing?.aggregatedProfile ?? truncate(newSummary, PROFILE_MAX_CHARS)

    await database.contactMemory.upsert({
      where: {
        organizationId_contactPhone: { organizationId, contactPhone },
      },
      create: {
        organizationId,
        contactPhone,
        aggregatedProfile: profile,
        sessionCount: 1,
      },
      update: {
        aggregatedProfile: profile,
        sessionCount: { increment: 1 },
      },
    })
    return true
  } catch (err) {
    console.warn(
      '[contact-memory] update failed:',
      err instanceof Error ? err.message : err,
    )
    return false
  }
}
