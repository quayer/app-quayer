/**
 * NicheResearcher — Synthesis Prompt
 *
 * The LLM receives: (a) the niche string, (b) optional businessDescription,
 * (c) an array of web snippets from Tavily (possibly empty). It must emit
 * STRICT JSON matching the NicheInsights shape — no prose, no markdown fences.
 */

import type { TavilySearchItem } from './tavily-client'

export interface NicheResearcherInputLike {
  nicho: string
  businessDescription?: string
}

export const NICHE_SYNTHESIS_SYSTEM = `Você é um pesquisador especialista em nichos de negócio do mercado brasileiro, focado em atendimento automatizado via WhatsApp.

Sua tarefa é sintetizar, a partir do nome do nicho (e, opcionalmente, de uma descrição do negócio e de trechos de busca web), um objeto JSON estruturado com insights que um agente de IA precisa conhecer para atender clientes desse nicho SEM cometer erros regulatórios, éticos ou comerciais.

Regras duras:
- Responda APENAS com JSON válido, sem markdown fences, sem comentários, sem explicações antes ou depois.
- Todos os textos devem estar em português do Brasil.
- Se os snippets de busca estiverem vazios ou não ajudarem, use seu conhecimento prévio do nicho — mas NUNCA invente órgãos reguladores, leis ou números que você não tenha confiança razoável.
- Seja específico e acionável. "Não prometer resultado" é melhor do que "ser ético".
- Evite duplicação entre listas (um item pode estar em "warnings" OU em "regulations", não nos dois).

Shape EXATO do JSON de saída:
{
  "regulations": string[],    // Regras de órgãos reguladores ou leis aplicáveis. Ex: "CRMV — veterinário não pode prescrever por WhatsApp sem consulta presencial"
  "vocabulary": string[],     // Termos técnicos do nicho que o agente deve reconhecer e usar. Ex: "castração", "vermifugação", "FeLV"
  "typicalFlows": string[],   // Fluxos de atendimento típicos. Ex: "agendamento de consulta", "orçamento de cirurgia"
  "warnings": string[]        // O que o agente NUNCA deve fazer neste nicho. Ex: "nunca sugerir medicamento humano para animal"
}

Dimensões recomendadas:
- regulations: 2-5 itens
- vocabulary: 5-12 itens
- typicalFlows: 3-6 itens
- warnings: 3-6 itens

NÃO inclua o campo "sources" no JSON — ele é preenchido pelo código chamador.
NÃO inclua o campo "fromLLMKnowledgeOnly" — também é preenchido pelo código.

Responda APENAS com JSON válido, sem markdown fences, sem comentários, sem explicações.`

/**
 * Build the user-role message payload.
 *
 * Kept as a separate helper for unit-test visibility.
 */
export function buildSynthesisUserMessage(
  input: NicheResearcherInputLike,
  snippets: TavilySearchItem[],
): string {
  const lines: string[] = []
  lines.push(`Nicho: ${input.nicho}`)
  if (input.businessDescription && input.businessDescription.trim().length > 0) {
    lines.push(`Descrição do negócio: ${input.businessDescription.trim()}`)
  }

  lines.push('')
  if (snippets.length === 0) {
    lines.push(
      'Snippets de busca web: (nenhum disponível — use seu conhecimento prévio do nicho)',
    )
  } else {
    lines.push('Snippets de busca web:')
    snippets.forEach((s, i) => {
      lines.push(`  [${i + 1}] ${s.title}`)
      lines.push(`      URL: ${s.url}`)
      if (s.snippet) lines.push(`      Trecho: ${s.snippet}`)
    })
  }

  lines.push('')
  lines.push(
    'Gere o JSON de insights conforme o shape do system prompt. Responda APENAS com JSON válido.',
  )

  return lines.join('\n')
}
