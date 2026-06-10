/**
 * PromptWriter Sub-Agent — Prompt Templates
 *
 * Contains the system prompt that instructs the sub-LLM on HOW to fill the
 * canonical WhatsApp AI agent anatomy template, plus the `buildUserMessage`
 * helper that assembles the user-role payload from structured input.
 *
 * The template now covers the FULL 10-section anatomy required by the
 * validator (`validators/whatsapp-prompt-anatomy.ts`) — both sides consume
 * `templates/prompt-section-checklist.ts` as the single source of truth, so
 * the writer can no longer generate prompts that fail validation by design.
 *
 * Per-section content requirements (writerHints) are injected dynamically
 * from the checklist; `buildUserMessage` additionally accepts:
 *   - `builderContext` — data already collected via Builder cards (tools,
 *     hours, handoff, activation, identity, services). Missing data is marked
 *     `NÃO INFORMADO` so the writer emits a sensible default tagged [REVISAR].
 *   - `validatorFeedback` — error list from a failed validation, used by the
 *     self-correction retry to steer the second attempt.
 */

import {
  PROMPT_ANATOMY_TEMPLATE,
  NICHE_HINTS,
} from '../../templates/prompt-anatomy'
import {
  REQUIRED_PROMPT_SECTIONS,
  OPTIONAL_PROMPT_SECTIONS,
} from '../../templates/prompt-section-checklist'
import {
  formatBuilderContextBlock,
  type PromptWriterBuilderContext,
} from './builder-context'

// ---------------------------------------------------------------------------
// Sub-LLM system prompt — 10-section anatomy, hints derived from checklist
// ---------------------------------------------------------------------------

const SECTION_HINTS = REQUIRED_PROMPT_SECTIONS.map(
  (s) => `- "# ${s.heading}" ({{${s.key}}}): ${s.writerHint}`,
).join('\n')

const OPTIONAL_HINTS = OPTIONAL_PROMPT_SECTIONS.map(
  (s) => `- ${s.writerHint}`,
).join('\n')

export const SUB_LLM_SYSTEM = `Você é um especialista em prompt engineering para agentes de atendimento via WhatsApp no mercado brasileiro.

Sua tarefa é preencher EXATAMENTE o template markdown fornecido pelo usuário, substituindo cada placeholder {{...}} por conteúdo concreto, acionável e em português do Brasil. O template tem 10 seções obrigatórias.

Requisitos POR SEÇÃO (cada um é verificado por um validador automático — cumpra à risca):
${SECTION_HINTS}

Seções recomendadas (incluir apenas quando os dados existirem no contexto):
${OPTIONAL_HINTS}

Regras duras:
- Sempre em pt-BR.
- Máximo ~700 palavras no total; nenhuma seção acima de 120 palavras — prompts enxutos performam melhor.
- Use os "Dados já coletados do negócio" como fonte autoritativa: horário, handoff, time, ativação e identidade DEVEM refletir esses dados.
- Quando um dado vier marcado como "NÃO INFORMADO", preencha com um default sensato para o nicho e marque cada linha gerada assim com o sufixo [REVISAR] para o dono revisar depois.
- SOMENTE referencie ferramentas específicas (transfer_to_human, criar_agendamento, etc.) se elas estiverem explicitamente listadas em "Ferramentas habilitadas". Se a lista estiver vazia ou ausente, descreva apenas COMPORTAMENTOS (ex: "informe que não pode ajudar") sem mencionar nomes de ferramentas ou integrações.
- NUNCA invente integrações, nomes próprios, preços ou dados sensíveis que não estejam no brief ou nos dados coletados.
- NUNCA inclua cabeçalhos extras além dos 10 do template (mais "# Horário de atendimento" quando houver dados de horário).
- NUNCA envolva a resposta em blocos de código — devolva markdown cru.
- NUNCA mencione capacidades que dependem de ferramentas não listadas (ex: agendar consulta, enviar preço, escalar para humano) se a ferramenta correspondente não estiver habilitada.

Se houver um bloco "## Correções exigidas pelo validador", a tentativa anterior REPROVOU — corrija TODOS os pontos listados sem regredir as demais seções.

Responda APENAS com o template preenchido, sem comentários antes ou depois.`

// ---------------------------------------------------------------------------
// User message assembler
// ---------------------------------------------------------------------------

export interface BuildUserMessageInput {
  brief: string
  nicho: string
  objetivo: string
  /** Tools already attached/selected for this agent. Empty = none yet. */
  attachedTools?: string[]
  nicheInsights?: {
    regulations?: string[]
    vocabulary?: string[]
    typicalFlows?: string[]
    warnings?: string[]
  }
  /** Data already collected via Builder cards (builderState projection). */
  builderContext?: PromptWriterBuilderContext
  /** Validator error messages from a failed attempt (self-correction retry). */
  validatorFeedback?: string[]
}

/**
 * Match free-text `nicho` against `NICHE_HINTS` via substring. Falls back to
 * the `outro` hint when no known vertical matches.
 */
function resolveNicheHint(nicho: string): string {
  const nichoLower = nicho.toLowerCase()
  return (
    Object.entries(NICHE_HINTS).find(([key]) =>
      nichoLower.includes(key),
    )?.[1] ?? NICHE_HINTS.outro
  )
}

/**
 * Format a single `nicheInsights` list into a bullet block. Returns an empty
 * string if the list is missing or empty so callers can concatenate safely.
 */
function formatInsightList(heading: string, items?: string[]): string {
  if (!items || items.length === 0) return ''
  const bullets = items.map((x) => `- ${x}`).join('\n')
  return `### ${heading}\n${bullets}\n`
}

/**
 * Build the user-role message sent to the sub-LLM.
 *
 * Block order: brief → objetivo → niche hint → insights → dados coletados →
 * ferramentas → correções do validador (retry only) → template.
 */
export function buildUserMessage(input: BuildUserMessageInput): string {
  const nicheHint = resolveNicheHint(input.nicho)

  const insightsBlock = input.nicheInsights
    ? buildInsightsBlock(input.nicheInsights)
    : ''

  const contextBlock = formatBuilderContextBlock(input.builderContext)

  const toolsBlock =
    input.attachedTools && input.attachedTools.length > 0
      ? `## Ferramentas habilitadas\n${input.attachedTools.map((t) => `- ${t}`).join('\n')}\n`
      : `## Ferramentas habilitadas\nNenhuma ferramenta configurada ainda. NÃO mencione capacidades que dependam de ferramentas (agendamento, envio de preço, escalação para humano, etc.).\n`

  const feedbackBlock =
    input.validatorFeedback && input.validatorFeedback.length > 0
      ? `## Correções exigidas pelo validador\nA tentativa anterior REPROVOU na validação. Corrija TODOS os pontos abaixo:\n${input.validatorFeedback.map((f) => `- ${f}`).join('\n')}\n`
      : ''

  return `Preencha o template abaixo com base no brief do cliente.

## Brief do cliente
${input.brief}

## Objetivo primário
${input.objetivo}

## Contexto do nicho: ${input.nicho}
${nicheHint}
(Sugestões de nichos com dicas especializadas disponíveis: advocacia, contabilidade, seguros. Para outros nichos, adapte o tom e as regras ao contexto descrito.)
${insightsBlock}
${contextBlock}
${toolsBlock}
${feedbackBlock}## Template (preencha TODOS os placeholders)
${PROMPT_ANATOMY_TEMPLATE}`
}

function buildInsightsBlock(insights: {
  regulations?: string[]
  vocabulary?: string[]
  typicalFlows?: string[]
  warnings?: string[]
}): string {
  const chunks = [
    formatInsightList('Regulamentações', insights.regulations),
    formatInsightList('Vocabulário do setor', insights.vocabulary),
    formatInsightList('Fluxos típicos', insights.typicalFlows),
    formatInsightList('Alertas', insights.warnings),
  ].filter(Boolean)

  if (chunks.length === 0) return ''

  return `\n## Insights do nicho\n${chunks.join('\n')}`
}
