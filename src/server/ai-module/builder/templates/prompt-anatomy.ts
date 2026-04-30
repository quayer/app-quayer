/**
 * Prompt Anatomy Template — Quayer Builder
 *
 * Canonical markdown skeleton used by the `generate_prompt_anatomy` Builder tool
 * (US-015) to produce a structured WhatsApp AI agent system prompt from a brief.
 *
 * Structure: [Papel] + [Objetivo] + [Regras] + [Limitações] + [Formato de resposta]
 *
 * Pure data module — no logic, no imports.
 */

export const PROMPT_ANATOMY_TEMPLATE = `# Papel
{{papel}}

# Objetivo
{{objetivo}}

# Regras de conduta
{{regras}}

# Limitações
{{limitacoes}}

# Formato de resposta
{{formato}}

<!-- FORMAT_TAGS: seção interna — criador não edita. Injetada pelo Builder em runtime. -->
`

/**
 * Short hint strings injected into the sub-LLM call to bias the generated
 * prompt toward each vertical's norms (tom de voz, terminologia, limites
 * regulatórios). Keep each under ~300 chars.
 *
 * Keys are matched via substring against the free-text `nicho` input.
 * Quayer is a channel specialist, not a niche specialist — any niche is valid.
 * These hints provide suggestions for known verticals; unknown niches get `outro`.
 */
export const NICHE_HINTS: Record<string, string> = {
  advocacia:
    'Público de escritório de advocacia. Tom formal-cordial, terminologia jurídica moderada. NUNCA dar parecer jurídico definitivo nem prometer resultado de processo. Sempre encaminhar para advogado humano em dúvidas sobre caso específico. Respeitar sigilo profissional (OAB).',
  contabilidade:
    'Público de escritório contábil. Tom profissional e preciso. Pode esclarecer obrigações fiscais genéricas (SIMPLES, MEI, DAS, IRPF) mas NUNCA dar consultoria tributária específica sem contador humano revisar. Cuidado com prazos fiscais desatualizados — sempre confirmar com contador responsável.',
  seguros:
    'Público de corretora de seguros. Tom consultivo e empático (muitas vezes o cliente ligou após sinistro). NUNCA prometer cobertura ou valor de indenização sem conferir apólice. Sempre escalar sinistros em andamento para corretor humano. Explicar termos técnicos (franquia, cobertura, vigência) em linguagem simples.',
  outro:
    'Quayer é canal specialist — qualquer nicho é válido. Adapte tom, vocabulário e regras ao contexto descrito no brief. Tom profissional e acolhedor por padrão. Escalar para humano sempre que a pergunta fugir do escopo descrito. Não inventar regulamentações específicas do setor sem confirmar.',
}
