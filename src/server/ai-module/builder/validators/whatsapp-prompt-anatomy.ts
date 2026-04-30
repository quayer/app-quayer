/**
 * Prompt Anatomy Validator
 *
 * Pure function (no LLM) — checks whether a prompt contains the 10 required
 * structural sections derived from analysis of 20+ production prompts across
 * 13 niches (imoveis, saude, juridico, delivery, barbearia, etc).
 *
 * Canonical anatomy (10 required, 2 optional):
 *  1.  Papel/Identidade     — who the agent is + what it does NOT do
 *  2.  Objetivo             — main goal + success criteria
 *  3.  Tom de voz           — personality, style, examples (bom/ruim)
 *  4.  Comunicação          — operational limits (1 question/turn, max lines, retry)
 *  5.  Ferramentas          — tool table with "when to use"
 *  6.  Regras críticas      — SEMPRE/NUNCA section
 *  7.  Fluxo conversacional — numbered stages OR think-based dynamic flow
 *  8.  Gatilhos/Fallback    — expected signals + retry protocol
 *  9.  Limitações           — explicit scope boundaries (NUNCA / fora do escopo / PROIBIDO)
 * 10.  Encerramento         — explicit end condition (FIM / PARAR / handoff)
 *
 * Optional (detected but only warn):
 *  O1. Horário de atendimento
 *  O2. Resumo de handoff
 *
 * Capability Profiles — replace the false Tipo1/Tipo2 binary:
 *  CP1. CRM Context  — $json present without null-handling instructions → warning
 *  CP2. Think blocks — think() / <think> without specific targets → warning
 *  CP3. Reusable validations — 3+ stages but no VALIDAÇÕES_REUTILIZÁVEIS block → warning
 *  CP4. Service ordering — criar_agendamento without explicit listar_servicos-first → warning
 *
 * Error   → blocks publishing
 * Warning → informational, does not block
 */

import type { ValidationIssue, ValidationResult } from './index'

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

interface SectionDef {
  name: string
  description: string
  pattern: RegExp
  severity: 'error' | 'warning'
}

const REQUIRED_SECTIONS: SectionDef[] = [
  {
    name: 'Papel/Identidade',
    description:
      'Define who the agent is and what it does NOT do (responsabilidades + limites)',
    pattern:
      /\b(papel|persona|identity|identidade|voc[eê]\s+[eé]\s+[ao]?\s*\w+|voc[eê]\s+atua\s+como)\b/i,
    severity: 'error',
  },
  {
    name: 'Objetivo/Goal/Missão',
    description: 'Main goal + success criteria or end condition',
    pattern: /\b(objetivo|goal|miss[aã]o|prop[oó]sito|finalidade)\b/i,
    severity: 'error',
  },
  {
    name: 'Tom de voz',
    description:
      'Personality, style, and language rules — must include prohibited phrases or examples (bom/ruim)',
    pattern:
      /\b(tom(\s+de\s+voz)?|persona(lidade)?|estilo\s+de\s+comunica[cç][aã]o|exemplo\s+(bom|ruim|correto|errado|certo)|linguagem\s+(proibida?|informal|formal)|evite?\s+dizer|n[aã]o\s+use\s+(express[oõ]es?|frases?))\b/i,
    severity: 'error',
  },
  {
    name: 'Comunicação operacional',
    description:
      'Operational limits: one question per turn, max message length, retry protocol',
    pattern:
      /\b(uma\s+pergunta\s+por\s+vez|one\s+question\s+at\s+a\s+time|m[aá]ximo\s+de\s+\d\s+linhas?|at\s+most\s+\d\s+lines?|no\s+m[aá]ximo\s+\d\s+linhas?|retry\s+progressivo|tentativa\s+\d|reformule?\s+a\s+pergunta)\b/i,
    severity: 'error',
  },
  {
    name: 'Ferramentas/Tools',
    description: 'Tool list with "when to use" — at minimum a list of tool names',
    pattern:
      /\b(ferramentas?|tools?|integra[cç][oõ]es?|quando\s+usar|use\s+when|use\s+this\s+tool)\b/i,
    severity: 'error',
  },
  {
    name: 'Regras críticas / SEMPRE-NUNCA',
    description: 'Explicit SEMPRE/NUNCA or ALWAYS/NEVER rules section',
    pattern:
      /\b(regras?\s+cr[ií]ticas?|sempre\b.{0,60}\bnunca\b|nunca\b.{0,60}\bsempre\b|always\b.{0,60}\bnever\b|never\b.{0,60}\balways\b)\b/is,
    severity: 'error',
  },
  {
    name: 'Fluxo/Etapas',
    description:
      'Numbered stages (linear flow) OR explicit think steps (dynamic flow) — both forms are valid',
    pattern:
      /\b(etapa\s+\d|passo\s+\d|step\s+\d|fase\s+\d|execute\s+.think.|think\s+before|<think>|>> TOOL:\s*think)\b/i,
    severity: 'error',
  },
  {
    name: 'Gatilhos/Fallback',
    description:
      'Expected signals (acceptance synonyms, out-of-scope) + retry protocol',
    pattern:
      /\b(gatilho|trigger|retry|tenta\s+novamente|reformule?|fallback|fora\s+do\s+escopo|out.of.scope|n[aã]o\s+entendeu?)\b/i,
    severity: 'error',
  },
  {
    name: 'Limitações/Restrições',
    description:
      'Scope boundaries — can be a dedicated section OR embedded NUNCA/PROIBIDO/fora-do-escopo markers throughout the prompt',
    pattern:
      /\b(limita[cç][oõ]es?|restri[cç][oõ]es?|n[aã]o\s+(responde|trata|atende|faz)\b|fora\s+do\s+escopo|o\s+que\s+n[aã]o|out\s+of\s+scope|proibido|PROIBIDO)\b/i,
    severity: 'error',
  },
  {
    name: 'Encerramento/FIM',
    description: 'Explicit end condition on every branch (FIM, PARAR, END, handoff)',
    pattern:
      /\b(fim\b|parar\b|encerr[ae]|stop\b|end\s+conversation|transfer[eê]ncia\s+conclu[ií]da)\b/i,
    severity: 'error',
  },
]

// ---------------------------------------------------------------------------
// Optional — detected but only warns
// ---------------------------------------------------------------------------

const OPTIONAL_SECTIONS: SectionDef[] = [
  {
    name: 'Horário de atendimento',
    description:
      'Operating hours definition — recommended when agent has a `humano` transfer tool',
    pattern:
      /\b(hor[aá]rio\s+de\s+(atendimento|funcionamento)|atendemos?\s+(das?|de)\s+\d|fora\s+do\s+hor[aá]rio|\$now\.hour|\$now\.weekday)\b/i,
    severity: 'warning',
  },
  {
    name: 'Resumo de handoff',
    description: 'Structured summary format sent to human agent before transfer',
    pattern:
      /\b(resumo|handoff|transfer[eê]ncia|antes\s+de\s+acionar|antes\s+de\s+chamar).{0,200}(nome|cnpj|interesse|objetivo)\b/is,
    severity: 'warning',
  },
]

// ---------------------------------------------------------------------------
// Capability profiles — replaces the false Tipo1/Tipo2 binary
//
// v17 (barbearia) has BOTH numbered etapas AND think blocks AND $json context.
// A prompt is not "either/or" — it may activate multiple capabilities at once.
// Each capability generates specific targeted warnings when misconfigured.
// ---------------------------------------------------------------------------

interface CapabilityProfile {
  hasCrmContext: boolean        // $json references detected
  hasSequentialStages: boolean  // Etapa N / Passo N / Step N
  hasThinkBlocks: boolean       // think() / <think> / >> TOOL: think
  hasScheduling: boolean        // criar_agendamento / check_availability
  hasPriceLookup: boolean       // buscar_produtos / get_prices / search_catalog
}

function detectCapabilityProfile(prompt: string): CapabilityProfile {
  return {
    hasCrmContext: /\$json/i.test(prompt),
    hasSequentialStages: /\b(etapa\s+\d|passo\s+\d|step\s+\d)\b/i.test(prompt),
    hasThinkBlocks: /(\bthink\s+before\b|<think>|execute\s+.think.|>>\s*TOOL:\s*think)/i.test(prompt),
    hasScheduling: /\b(criar_agendamento|create_appointment|check_availability)\b/i.test(prompt),
    hasPriceLookup: /\b(buscar_produtos?|get_products?|lista_pre[cç]os?|get_prices?|search_catalog)\b/i.test(prompt),
  }
}

function capabilityWarnings(prompt: string, profile: CapabilityProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // CP1 — CRM context ($json) without null-handling instructions
  if (profile.hasCrmContext) {
    const hasNullHandling = /(\$json\s*\?\s*['"[]|\$json\.[\w]+\s*\?\?\s*|null|undefined|vazio|n[aã]o\s+preenchido|se\s+n[aã]o\s+houver)/i.test(prompt)
    if (!hasNullHandling) {
      issues.push({
        validator: 'anatomy',
        severity: 'warning',
        message:
          'Contexto CRM ($json) detectado sem tratamento de null/vazio. ' +
          'Adicione fallback para quando o campo não estiver preenchido: ex: "$json.name ?? (perguntar ao cliente)".',
      })
    }
  }

  // CP2 — Think blocks without specific targets
  if (profile.hasThinkBlocks) {
    const hasThinkTarget =
      /think.{0,80}(qual|se|quando|quem|o\s+que|analis[ae]|verifi[cq]|decide|escolh)/i.test(prompt)
    if (!hasThinkTarget) {
      issues.push({
        validator: 'anatomy',
        severity: 'warning',
        message:
          'Bloco think() detectado sem alvo específico de raciocínio. ' +
          'Defina o que o agente deve avaliar: ex: "think: verificar se cliente já forneceu dados".',
      })
    }
  }

  // CP3 — 3+ sequential stages without reusable validation blocks
  if (profile.hasSequentialStages) {
    const stageCount = (prompt.match(/\b(etapa|passo|step)\s+\d/gi) ?? []).length
    const hasReusableValidations =
      /\[(VALID|valida[cç][oõ]es?_reutiliz[aá]veis?|SHARED_CHECKS?|REGRAS_COMUNS?)\]/i.test(prompt)
    if (stageCount >= 3 && !hasReusableValidations) {
      issues.push({
        validator: 'anatomy',
        severity: 'warning',
        message:
          `Fluxo com ${stageCount} etapas sem bloco de validações reutilizáveis. ` +
          'Considere extrair checagens repetidas (ex: [VALIDAÇÕES_REUTILIZÁVEIS]) para evitar duplicação entre etapas.',
      })
    }
  }

  // CP4 — criar_agendamento without explicit listar_servicos-first ordering
  if (profile.hasScheduling) {
    const hasOrderConstraint =
      /(listar_servico|list_service|buscar_horario|check_availability).{0,200}(criar_agendamento|create_appointment)/is.test(prompt) ||
      /(antes\s+de\s+criar_agendamento|sempre\s+us[ae]\s+listar|serviceId\s+fresc)/i.test(prompt)
    if (!hasOrderConstraint) {
      issues.push({
        validator: 'anatomy',
        severity: 'warning',
        message:
          'Ferramenta de agendamento detectada sem restrição de ordem explícita. ' +
          'Adicione: "SEMPRE usar listar_servicos/check_availability antes de criar_agendamento para garantir serviceId fresco".',
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Structural checks
// ---------------------------------------------------------------------------

const SECTION_HEADING_RE = /^#{1,3}\s+.+$/gm

function countWordsInLargestSection(prompt: string): number {
  const headings = [...prompt.matchAll(SECTION_HEADING_RE)]

  if (headings.length === 0) {
    return prompt.split(/\s+/).filter(Boolean).length
  }

  let maxWords = 0

  for (let i = 0; i < headings.length; i++) {
    const start = (headings[i].index ?? 0) + headings[i][0].length
    const end = i + 1 < headings.length ? headings[i + 1].index : prompt.length
    const sectionText = prompt.slice(start, end)
    const wordCount = sectionText.split(/\s+/).filter(Boolean).length
    if (wordCount > maxWords) maxWords = wordCount
  }

  return maxWords
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const WORD_LIMIT = 400

export function validateAnatomy(prompt: string): ValidationResult {
  const issues: ValidationIssue[] = []
  const profile = detectCapabilityProfile(prompt)

  // Required sections
  for (const section of REQUIRED_SECTIONS) {
    if (!section.pattern.test(prompt)) {
      issues.push({
        validator: 'anatomy',
        severity: section.severity,
        message: `Seção obrigatória ausente: ${section.name} — ${section.description}`,
      })
    }
  }

  // Optional sections — warn when missing
  for (const section of OPTIONAL_SECTIONS) {
    if (!section.pattern.test(prompt)) {
      issues.push({
        validator: 'anatomy',
        severity: section.severity,
        message: `Seção recomendada ausente: ${section.name} — ${section.description}`,
      })
    }
  }

  // Capability-specific warnings (replaces false Tipo1/Tipo2 binary)
  issues.push(...capabilityWarnings(prompt, profile))

  // Section too long
  const maxWords = countWordsInLargestSection(prompt)
  if (maxWords > WORD_LIMIT) {
    issues.push({
      validator: 'anatomy',
      severity: 'warning',
      message: `Uma seção excede ${WORD_LIMIT} palavras (~${maxWords} encontradas). Considere dividir em sub-seções para maior clareza.`,
    })
  }

  return {
    pass: issues.every((i) => i.severity !== 'error'),
    issues,
  }
}
