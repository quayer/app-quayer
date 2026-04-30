/**
 * Journey / Tool-Funnel Consistency Validator
 *
 * Checks that the prompt and the list of enabled tools are consistent.
 * All issues are **warnings** (informational, do not block publishing).
 *
 * Rules:
 *  J1  — Scheduling mention without check_availability tool
 *  J2  — create_lead tool without data-collection mention
 *  J3  — Funnel stages without transfer_to_human tool
 *  J4  — humano tool without pre-transfer handoff message (new)
 *  J5  — humano tool without operating-hours context (new)
 *  J6  — humano tool without PARAR/FIM instruction after transfer (new)
 *  J7  — Hardcoded prices with a price-lookup tool present (new)
 *  J8  — Tipo 1 (numbered steps) with no explicit end condition per branch (new)
 *  J9  — Tipo 2 (dynamic) without think/context but with $json references (new)
 *  J10 — Medical/legal niche without referral guardrail (new)
 */

import type { ValidationIssue, ValidationResult } from './index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the prompt's lowercase mentions any of the given terms */
function mentionsAny(prompt: string, terms: RegExp[]): boolean {
  return terms.some((t) => t.test(prompt))
}

function hasTool(tools: string[], pattern: RegExp): boolean {
  return tools.some((t) => pattern.test(t))
}

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

interface JourneyRule {
  id: string
  label: string
  check: (prompt: string, tools: string[]) => boolean
}

const JOURNEY_RULES: JourneyRule[] = [
  // J1 — Scheduling without availability tool
  {
    id: 'J1',
    label:
      'Prompt menciona agendamento mas "check_availability" não está habilitado nas ferramentas',
    check: (prompt, tools) => {
      const mentions = /\b(agendamento|scheduling|agendar|marcar\s+hor[aá]rio|book\s+appointment)\b/i.test(prompt)
      const hasToolFn = hasTool(tools, /^check_availability$/i)
      return mentions && !hasToolFn
    },
  },

  // J2 — create_lead without data collection in prompt
  {
    id: 'J2',
    label:
      'Ferramenta "create_lead" habilitada mas o prompt não menciona coleta de nome, telefone ou dados',
    check: (prompt, tools) => {
      const hasLead = hasTool(tools, /^create_lead$/i)
      const mentionsCollection =
        /\b(nome|name|telefone|phone|celular|dados|data|coletar|collect|captur)/i.test(prompt)
      return hasLead && !mentionsCollection
    },
  },

  // J3 — Funnel stages without transfer_to_human
  {
    id: 'J3',
    label:
      'Prompt tem etapas de funil mas "transfer_to_human" / "humano" não está habilitado',
    check: (prompt, tools) => {
      const hasFunnel =
        /\b(funil|funnel|etapa|stage|qualifica[cç][aã]o|qualification|pipeline)\b/i.test(prompt)
      const hasHumano = hasTool(tools, /^(transfer_to_human|humano)$/i)
      return hasFunnel && !hasHumano
    },
  },

  // J4 — humano tool without handoff summary format
  {
    id: 'J4',
    label:
      'Ferramenta "humano" conectada mas sem formato de resumo de handoff. ' +
      'Defina um template (Nome, Interesse, CNPJ, etc.) enviado antes de acionar a transferência.',
    check: (prompt, tools) => {
      const hasHumano = hasTool(tools, /^(transfer_to_human|humano)$/i)
      if (!hasHumano) return false

      // Look for any structured handoff block
      const hasHandoff = mentionsAny(prompt, [
        /\b(resumo|handoff|antes\s+de\s+acionar|antes\s+de\s+chamar|mensagem\s+de\s+transfer[eê]ncia)\b/i,
        /\b(nome|cnpj|interesse|objetivo)\s*[:=]/i,
      ])
      return !hasHandoff
    },
  },

  // J5 — humano tool without operating hours context
  {
    id: 'J5',
    label:
      'Ferramenta "humano" conectada mas sem contexto de horário de atendimento. ' +
      'Adicione uma mensagem de transferência que informe o cliente sobre o horário de funcionamento ' +
      '(use $now.hour / $now.weekday para personalizar a mensagem conforme o momento do contato). ' +
      'Exemplo: fora do horário → "Nosso atendimento volta segunda-feira às 08:30".',
    check: (prompt, tools) => {
      const hasHumano = hasTool(tools, /^(transfer_to_human|humano)$/i)
      if (!hasHumano) return false

      const hasHoursContext = mentionsAny(prompt, [
        /\$now\.hour/i,
        /\$now\.weekday/i,
        /\$now\.minute/i,
        /hor[aá]rio\s+de\s+(atendimento|funcionamento)/i,
        /fora\s+do\s+hor[aá]rio/i,
        /atendemos?\s+(das?|de)\s+\d{1,2}/i,
        /volta\s+(segunda|amanhã|\w+-feira)/i,
      ])
      return !hasHoursContext
    },
  },

  // J6 — humano tool without PARAR/FIM after transfer
  {
    id: 'J6',
    label:
      'Ferramenta "humano" conectada mas sem instrução de PARAR após a transferência. ' +
      'Adicione: "Após acionar [humano] → PARAR. Não enviar mais mensagens." para evitar respostas duplicadas.',
    check: (prompt, tools) => {
      const hasHumano = hasTool(tools, /^(transfer_to_human|humano)$/i)
      if (!hasHumano) return false

      const hasStop = mentionsAny(prompt, [
        /\b(parar?|stop|fim\b|end\b|encerr[ae])\b.{0,60}\b(após|depois|apos)\b/i,
        /ap[oó]s\b.{0,60}\b(parar?|stop|fim\b|encerr[ae])\b/i,
        /n[aã]o\s+envi[ae]\s+mais\s+mensagens?/i,
        /\[sistema\s+pausa\]/i,
      ])
      return !hasStop
    },
  },

  // J7 — Hardcoded prices with a price-lookup tool
  {
    id: 'J7',
    label:
      'Preços hardcoded detectados com ferramenta de busca ativa. ' +
      'Remova valores fixos do prompt — busque sempre via ferramenta para garantir precisão.',
    check: (prompt, tools) => {
      const hasPriceTool = hasTool(
        tools,
        /^(buscar_produtos?|get_products?|lista_pre[cç]os?|get_prices?|search_catalog)$/i
      )
      if (!hasPriceTool) return false

      // Detect hardcoded BRL values
      const hasHardcodedPrice = /R\$\s*\d{1,3}([.,]\d{3})*([.,]\d{2})?/.test(prompt)
      return hasHardcodedPrice
    },
  },

  // J8 — Tipo 1 (numbered steps) missing end condition
  {
    id: 'J8',
    label:
      'Prompt Tipo 1 (fluxo por etapas) sem condição de encerramento explícita em todos os ramos. ' +
      'Cada caminho possível deve terminar com FIM / PARAR / transfer.',
    check: (prompt, _tools) => {
      const hasSections = /\b(etapa\s+\d|passo\s+\d|step\s+\d)\b/i.test(prompt)
      if (!hasSections) return false

      // Count stage markers vs end markers
      const stageCount = (prompt.match(/\b(etapa|passo|step)\s+\d/gi) ?? []).length
      const endCount = (prompt.match(/\b(fim\b|parar\b|end\b|encerr[ae])\b/gi) ?? []).length

      // Warn if there are multiple stages but few/no end markers
      return stageCount > 2 && endCount === 0
    },
  },

  // J9 — Tipo 2 dynamic without context variables
  {
    id: 'J9',
    label:
      'Prompt Tipo 2 (dinâmico com think) detectado sem variáveis de contexto ($json, $now). ' +
      'Prompts dinâmicos precisam de dados pré-carregados para pular perguntas já respondidas.',
    check: (prompt, _tools) => {
      const isDynamic =
        /(\bexecute\s+.?think.?|\b<think>\b|think\s+before\s+(each|cada))/i.test(prompt)
      if (!isDynamic) return false

      const hasContext = /(\$json|\$now|\{\{.*?\}\})/i.test(prompt)
      return !hasContext
    },
  },

  // J10 — Medical/legal niche without safety disclaimer
  {
    id: 'J10',
    label:
      'Nicho médico ou jurídico detectado sem guardrail de segurança/isenção de responsabilidade. ' +
      'Adicione frases como "Não constitui consulta jurídica" ou "Consulte um profissional de saúde".',
    check: (prompt, _tools) => {
      const isSensitiveNiche = mentionsAny(prompt, [
        /\b(m[eé]dico|cl[ií]nica|sa[uú]de|paciente|diagn[oó]stico|prescri[cç][aã]o)\b/i,
        /\b(advogad[ao]|jur[ií]dic[ao]|processo|a[cç][aã]o\s+judicial|oab)\b/i,
      ])
      if (!isSensitiveNiche) return false

      const hasSafetyClause = mentionsAny(prompt, [
        /n[aã]o\s+(constitui|[eé])\s+consulta\s+(jur[ií]dica|m[eé]dica)/i,
        /consulte\s+um\s+(profissional|especialista|m[eé]dico|advogad[ao])/i,
        /n[aã]o\s+substitui\s+(atendimento|consulta)/i,
        /isenção\s+de\s+responsabilidade|disclaimer/i,
      ])
      return !hasSafetyClause
    },
  },
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateJourney(
  prompt: string,
  enabledTools: string[]
): ValidationResult {
  const issues: ValidationIssue[] = []

  for (const rule of JOURNEY_RULES) {
    if (rule.check(prompt, enabledTools)) {
      issues.push({
        validator: 'journey',
        severity: 'warning',
        message: `[${rule.id}] ${rule.label}`,
      })
    }
  }

  return {
    pass: true, // journey never blocks — warnings only
    issues,
  }
}
