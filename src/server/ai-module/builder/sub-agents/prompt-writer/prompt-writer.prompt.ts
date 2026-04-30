/**
 * PromptWriter Sub-Agent — Prompt Templates
 *
 * Contains the system prompt that instructs the sub-LLM on HOW to fill the
 * canonical WhatsApp AI agent anatomy template, plus the `buildUserMessage`
 * helper that assembles the user-role payload from structured input.
 *
 * The SUB_LLM_SYSTEM constant is intentionally copied verbatim from the
 * original `tools/generate-prompt-anatomy.tool.ts` (Phase B of the extraction)
 * so that behavior is byte-identical before the coordinator (Phase C) rewires
 * the tool to call this sub-agent.
 */

import {
  PROMPT_ANATOMY_TEMPLATE,
  NICHE_HINTS,
} from '../../templates/prompt-anatomy'

// ---------------------------------------------------------------------------
// Sub-LLM system prompt (copied verbatim from generate-prompt-anatomy.tool.ts)
// ---------------------------------------------------------------------------

export const SUB_LLM_SYSTEM = `Você é um especialista em prompt engineering para agentes de atendimento via WhatsApp no mercado brasileiro.

Sua tarefa é preencher EXATAMENTE o template markdown fornecido pelo usuário, substituindo os placeholders {{papel}}, {{objetivo}}, {{regras}}, {{limitacoes}} e {{formato}} por conteúdo concreto, acionável e em português do Brasil.

Regras duras:
- Sempre em pt-BR.
- Máximo ~400 palavras no total — prompts enxutos performam melhor.
- Seção "Regras de conduta": use lista com marcadores, 3 a 6 itens.
- Seção "Limitações": use lista com marcadores. SOMENTE referencie ferramentas específicas (transfer_to_human, schedule_appointment, etc.) se elas estiverem explicitamente listadas em "Ferramentas habilitadas". Se a lista estiver vazia ou ausente, descreva apenas COMPORTAMENTOS (ex: "informe que não pode ajudar") sem mencionar nomes de ferramentas ou integrações.
- Seção "Formato de resposta": 2-4 frases descrevendo tom, comprimento e uso de emojis/formatação.
- NUNCA invente integrações, nomes próprios, preços ou dados sensíveis que não estejam no brief.
- NUNCA inclua cabeçalhos extras além dos 5 do template.
- NUNCA envolva a resposta em blocos de código — devolva markdown cru.
- NUNCA mencione capacidades que dependem de ferramentas não listadas (ex: agendar consulta, enviar preço, escalar para humano) se a ferramenta correspondente não estiver habilitada.

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
 * Build the user-role message sent to the sub-LLM. The structure mirrors the
 * original inline logic in `generate-prompt-anatomy.tool.ts` (lines 117-136).
 *
 * When `nicheInsights` is provided, a `## Insights do nicho` section is
 * injected after the niche hint and before the template block. Absent
 * insights preserve byte-for-byte parity with the legacy tool.
 */
export function buildUserMessage(input: BuildUserMessageInput): string {
  const nicheHint = resolveNicheHint(input.nicho)

  const insightsBlock = input.nicheInsights
    ? buildInsightsBlock(input.nicheInsights)
    : ''

  const toolsBlock =
    input.attachedTools && input.attachedTools.length > 0
      ? `## Ferramentas habilitadas\n${input.attachedTools.map((t) => `- ${t}`).join('\n')}\n`
      : `## Ferramentas habilitadas\nNenhuma ferramenta configurada ainda. NÃO mencione capacidades que dependam de ferramentas (agendamento, envio de preço, escalação para humano, etc.).\n`

  return `Preencha o template abaixo com base no brief do cliente.

## Brief do cliente
${input.brief}

## Objetivo primário
${input.objetivo}

## Contexto do nicho: ${input.nicho}
${nicheHint}
(Sugestões de nichos com dicas especializadas disponíveis: advocacia, contabilidade, seguros. Para outros nichos, adapte o tom e as regras ao contexto descrito.)
${insightsBlock}
${toolsBlock}
## Template (preencha TODOS os placeholders)
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
