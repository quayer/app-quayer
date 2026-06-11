/**
 * Prompt Section Checklist — SINGLE SOURCE OF TRUTH (DRY)
 *
 * Canonical list of the 10 REQUIRED + 2 OPTIONAL structural sections of a
 * WhatsApp agent system prompt. Derived from analysis of 20+ production
 * prompts across 13 niches (imoveis, saude, juridico, delivery, barbearia...).
 *
 * Consumed by BOTH sides of the pipeline so they can never drift again:
 *   - `templates/prompt-anatomy.ts`               → builds the writer template
 *     (headings + placeholders) that the PromptWriter sub-LLM fills in.
 *   - `validators/whatsapp-prompt-anatomy.ts`     → builds the REQUIRED /
 *     OPTIONAL section checks that gate publishing.
 *   - `sub-agents/prompt-writer/*`                → section parsing + per-section
 *     writer hints in the sub-LLM system prompt.
 *
 * Historical context: the writer used to emit only 5 sections while the
 * validator demanded 10 — every generated prompt failed anatomy validation.
 * This module is the fix: one checklist, two consumers.
 *
 * Pure data module — no IO, no `any`. Only TS + RegExp literals.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Keys of the 10 canonical sections (also the placeholder names in the template). */
export type PromptSectionKey =
  | 'papel'
  | 'objetivo'
  | 'tom'
  | 'comunicacao'
  | 'ferramentas'
  | 'regras'
  | 'fluxo'
  | 'gatilhos'
  | 'limitacoes'
  | 'encerramento'

export interface PromptSectionChecklistItem {
  /** Placeholder/parse key — matches `PromptWriterSections` fields. */
  key: PromptSectionKey
  /** Human-readable name used in validator messages. */
  name: string
  /** Canonical markdown heading emitted by the writer template (without `#`). */
  heading: string
  /** What the section must contain (validator message tail). */
  description: string
  /**
   * Content-detection regex used by the anatomy validator. Tested against the
   * FULL prompt text (headings included). Moved verbatim from the original
   * `validators/whatsapp-prompt-anatomy.ts` REQUIRED_SECTIONS.
   */
  detectPattern: RegExp
  /**
   * Heading-detection regex used by the PromptWriter section parser. Tested
   * line-by-line; tolerant to `#`/`##`/`###` depth, missing diacritics and
   * heading-suffix variations.
   */
  headingPattern: RegExp
  /** Instruction injected into the writer sub-LLM so the body satisfies `detectPattern`. */
  writerHint: string
}

/** Optional sections — recommended; absence only warns, never blocks. */
export interface PromptOptionalSectionItem {
  name: string
  description: string
  detectPattern: RegExp
  /** Hint for the writer; applied only when the corresponding data exists. */
  writerHint: string
}

// ---------------------------------------------------------------------------
// The 10 required sections (order = emission order in the template)
// ---------------------------------------------------------------------------

export const REQUIRED_PROMPT_SECTIONS: readonly PromptSectionChecklistItem[] = [
  {
    key: 'papel',
    name: 'Papel/Identidade',
    heading: 'Papel',
    description:
      'Define who the agent is and what it does NOT do (responsabilidades + limites)',
    detectPattern:
      /\b(papel|persona|identity|identidade|voc[eê]\s+[eé]\s+[ao]?\s*\w+|voc[eê]\s+atua\s+como)\b/i,
    headingPattern: /^#+\s+Papel\b.*$/i,
    writerHint:
      'Quem o agente é ("Você é...") + o que ele NÃO faz. 2-4 frases.',
  },
  {
    key: 'objetivo',
    name: 'Objetivo/Goal/Missão',
    heading: 'Objetivo',
    description: 'Main goal + success criteria or end condition',
    detectPattern: /\b(objetivo|goal|miss[aã]o|prop[oó]sito|finalidade)\b/i,
    headingPattern: /^#+\s+Objetivo\b.*$/i,
    writerHint:
      'Objetivo principal + critério de sucesso (quando a missão está cumprida). 2-3 frases.',
  },
  {
    key: 'tom',
    name: 'Tom de voz',
    heading: 'Tom de voz',
    description:
      'Personality, style, and language rules — must include prohibited phrases or examples (bom/ruim)',
    detectPattern:
      /\b(tom(\s+de\s+voz)?|persona(lidade)?|estilo\s+de\s+comunica[cç][aã]o|exemplo\s+(bom|ruim|correto|errado|certo)|linguagem\s+(proibida?|informal|formal)|evite?\s+dizer|n[aã]o\s+use\s+(express[oõ]es?|frases?))\b/i,
    headingPattern: /^#+\s+Tom(\s+de\s+voz)?\b.*$/i,
    writerHint:
      'Personalidade e estilo. OBRIGATÓRIO incluir 1 "Exemplo bom:" + 1 "Exemplo ruim:" e a linha "Linguagem proibida:" com frases vetadas.',
  },
  {
    key: 'comunicacao',
    name: 'Comunicação operacional',
    heading: 'Comunicação',
    description:
      'Operational limits: one question per turn, max message length, retry protocol',
    detectPattern:
      /\b(uma\s+pergunta\s+por\s+vez|one\s+question\s+at\s+a\s+time|m[aá]ximo\s+de\s+\d\s+linhas?|at\s+most\s+\d\s+lines?|no\s+m[aá]ximo\s+\d\s+linhas?|retry\s+progressivo|tentativa\s+\d|reformule?\s+a\s+pergunta)\b/i,
    headingPattern: /^#+\s+Comunica[cç][aã]o\b.*$/i,
    writerHint:
      'Limites operacionais. OBRIGATÓRIO conter literalmente: "Uma pergunta por vez", "no máximo 3 linhas" (ou outro número) e "Retry progressivo" (1ª tentativa reformule, 2ª ofereça humano). Inclua também formato de resposta (comprimento, emojis).',
  },
  {
    key: 'ferramentas',
    name: 'Ferramentas/Tools',
    heading: 'Ferramentas',
    description: 'Tool list with "when to use" — at minimum a list of tool names',
    detectPattern:
      /\b(ferramentas?|tools?|integra[cç][oõ]es?|quando\s+usar|use\s+when|use\s+this\s+tool)\b/i,
    headingPattern: /^#+\s+Ferramentas?\b.*$/i,
    writerHint:
      'Lista com marcadores "- nome_da_tool: quando usar". Use SOMENTE as ferramentas habilitadas listadas no contexto. Se nenhuma estiver habilitada, escreva que o agente responde apenas com conhecimento próprio, sem integrações.',
  },
  {
    key: 'regras',
    name: 'Regras críticas / SEMPRE-NUNCA',
    heading: 'Regras críticas',
    description: 'Explicit SEMPRE/NUNCA or ALWAYS/NEVER rules section',
    detectPattern:
      /\b(regras?\s+cr[ií]ticas?|sempre\b.{0,60}\bnunca\b|nunca\b.{0,60}\bsempre\b|always\b.{0,60}\bnever\b|never\b.{0,60}\balways\b)\b/is,
    headingPattern: /^#+\s+Regras\b.*$/i,
    writerHint:
      'Lista de 3-6 itens começando com "SEMPRE" ou "NUNCA" (ao menos um de cada).',
  },
  {
    key: 'fluxo',
    name: 'Fluxo/Etapas',
    heading: 'Fluxo de atendimento',
    description:
      'Numbered stages (linear flow) OR explicit think steps (dynamic flow) — both forms are valid',
    detectPattern:
      /\b(etapa\s+\d|passo\s+\d|step\s+\d|fase\s+\d|execute\s+.think.|think\s+before|<think>|>> TOOL:\s*think)\b/i,
    headingPattern: /^#+\s+Fluxo\b.*$/i,
    writerHint:
      'Etapas numeradas "Etapa 1:", "Etapa 2:"... (3 a 6 etapas) do primeiro contato até o encerramento ou handoff.',
  },
  {
    key: 'gatilhos',
    name: 'Gatilhos/Fallback',
    heading: 'Gatilhos e fallback',
    description:
      'Expected signals (acceptance synonyms, out-of-scope) + retry protocol',
    detectPattern:
      /\b(gatilho|trigger|retry|tenta\s+novamente|reformule?|fallback|fora\s+do\s+escopo|out.of.scope|n[aã]o\s+entendeu?)\b/i,
    headingPattern: /^#+\s+Gatilhos?\b.*$/i,
    writerHint:
      'Sinais esperados (aceite, fora do escopo) + protocolo de fallback quando o agente não entender (reformular, depois escalar).',
  },
  {
    key: 'limitacoes',
    name: 'Limitações/Restrições',
    heading: 'Limitações',
    description:
      'Scope boundaries — can be a dedicated section OR embedded NUNCA/PROIBIDO/fora-do-escopo markers throughout the prompt',
    detectPattern:
      /\b(limita[cç][oõ]es?|restri[cç][oõ]es?|n[aã]o\s+(responde|trata|atende|faz)\b|fora\s+do\s+escopo|o\s+que\s+n[aã]o|out\s+of\s+scope|proibido|PROIBIDO)\b/i,
    headingPattern: /^#+\s+Limita[cç][oõ]es\b.*$/i,
    writerHint:
      'Lista do que o agente NÃO responde/faz ("Não responde sobre...", "fora do escopo"). Sem mencionar ferramentas não habilitadas.',
  },
  {
    key: 'encerramento',
    name: 'Encerramento/FIM',
    heading: 'Encerramento',
    description: 'Explicit end condition on every branch (FIM, PARAR, END, handoff)',
    detectPattern:
      /\b(fim\b|parar\b|encerr[ae]|stop\b|end\s+conversation|transfer[eê]ncia\s+conclu[ií]da)\b/i,
    headingPattern: /^#+\s+Encerramento\b.*$/i,
    writerHint:
      'Condição explícita de fim para CADA desfecho (objetivo cumprido, handoff, desistência). Termine cada desfecho com a palavra "FIM" ou "parar de responder".',
  },
]

// ---------------------------------------------------------------------------
// Optional sections — warn-only
// ---------------------------------------------------------------------------

export const OPTIONAL_PROMPT_SECTIONS: readonly PromptOptionalSectionItem[] = [
  {
    name: 'Horário da equipe humana',
    description:
      'Human team operating hours — recommended when agent has a `humano` transfer tool',
    detectPattern:
      /\b(hor[aá]rio\s+de\s+(atendimento|funcionamento)|atendemos?\s+(das?|de)\s+\d|fora\s+do\s+hor[aá]rio|\$now\.hour|\$now\.weekday)\b/i,
    writerHint:
      'Quando o contexto trouxer horário da equipe humana, inclua uma seção "# Horário da equipe" com os horários e a expectativa de retorno humano fora do horário. A IA continua respondendo 24/7.',
  },
  {
    name: 'Resumo de handoff',
    description: 'Structured summary format sent to human agent before transfer',
    detectPattern:
      /\b(resumo|handoff|transfer[eê]ncia|antes\s+de\s+acionar|antes\s+de\s+chamar).{0,200}(nome|cnpj|interesse|objetivo)\b/is,
    writerHint:
      'Quando o contexto trouxer handoff para humanos, instrua o agente a montar um resumo (nome, interesse, objetivo) antes de acionar a transferência — descreva isso em Gatilhos/Encerramento.',
  },
]

// ---------------------------------------------------------------------------
// Derived helpers (kept here so consumers can't re-derive divergent lists)
// ---------------------------------------------------------------------------

/** All 10 canonical keys, in emission order. */
export const PROMPT_SECTION_KEYS: readonly PromptSectionKey[] =
  REQUIRED_PROMPT_SECTIONS.map((s) => s.key)

/** Lookup by key — handy for targeted hints/error messages. */
export function getPromptSection(
  key: PromptSectionKey,
): PromptSectionChecklistItem {
  // PROMPT_SECTION_KEYS is derived from the same array, so this never misses.
  const found = REQUIRED_PROMPT_SECTIONS.find((s) => s.key === key)
  if (!found) throw new Error(`Unknown prompt section key: ${key}`)
  return found
}
