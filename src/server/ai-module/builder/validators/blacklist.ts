/**
 * Prompt Blacklist Validator
 *
 * Regex patterns (pt-BR + en) that detect harmful, deceptive, or abusive
 * instructions in the prompt text. Organized in 4 categories:
 *
 *  A — Operational abuse (agent instructed to behave badly)
 *  B — Content deception (false claims, data leaks, fraud)
 *  C — Legal/ethical violations (medical/legal advice, third-party data)
 *  D — Security (jailbreak, prompt injection, identity hijack)
 *
 * Error  → blocks publishing
 * Warning → informational, does not block
 */

import type { ValidationIssue, ValidationResult } from './index'

interface BlacklistEntry {
  label: string
  pattern: RegExp
  severity: 'error' | 'warning'
}

// ---------------------------------------------------------------------------
// Category A — Operational abuse
// ---------------------------------------------------------------------------

const CAT_A: BlacklistEntry[] = [
  {
    // Instructing agent to announce actions before executing (anti-pattern)
    label: 'A1: Instructs agent to announce actions before executing ("Vou verificar…", "Aguarde…")',
    pattern:
      /sempre\s+(diga?|fale|avise)\s+.{0,30}(vou\s+(verificar|buscar|consultar)|aguarde)/i,
    severity: 'warning',
  },
  {
    // Instructing agent to ask multiple questions at once
    label: 'A3: Instructs agent to ask multiple questions at once — violates "one question per turn" rule',
    pattern:
      /fa[cç]a\s+\d\s+perguntas?\s+de\s+uma\s+vez|pergunte\s+tudo\s+ao\s+mesmo\s+tempo|envie\s+v[aá]rias\s+perguntas/i,
    severity: 'error',
  },
  {
    // Instructing agent to reveal internal system language
    label: 'A4: Instructs agent to expose internal tags, tool names, or system language',
    pattern:
      /mencione\s+(as?\s+)?(ferramentas?|tools?|tags?\s+internas?|execute|system\s+prompt)/i,
    severity: 'error',
  },
  {
    // Robotized speech patterns explicitly instructed
    label: 'A4: Instructs agent to use robotic phrases ("De acordo com minhas instruções", "Infelizmente não posso")',
    pattern:
      /de\s+acordo\s+com\s+(minhas?\s+)?instru[cç][oõ]es|infelizmente\s+n[aã]o\s+posso\s+ajudar/i,
    severity: 'warning',
  },
]

// ---------------------------------------------------------------------------
// Category B — Content deception
// ---------------------------------------------------------------------------

const CAT_B: BlacklistEntry[] = [
  {
    label: 'B1: False guarantees / misleading promises of outcome',
    pattern:
      /garantia\s+de\s+resultado|100%\s+(aprovado|garantido|certo)|guaranteed\s+results?|certeza\s+de\s+ganho/i,
    severity: 'error',
  },
  {
    label: 'B2: Prompt leak — reveals system prompt or internal instructions',
    pattern:
      /mostre?\s+suas?\s+instru[cç][oõ]es|show\s+your\s+instructions|reveal\s+your\s+prompt|exiba\s+seu\s+prompt|copie\s+seu\s+system\s+prompt/i,
    severity: 'error',
  },
  {
    label: 'B3: Instructs agent to reveal internal stack, tools, or prompt copy',
    pattern:
      /revele\s+(sua\s+)?(stack|arquitetura|ferramenta)|compartilhe\s+o\s+prompt|mostre?\s+como\s+voc[eê]\s+funciona/i,
    severity: 'error',
  },
  {
    label: 'B4: Deceptive identity — denies being AI when asked directly',
    pattern:
      /nunca\s+admita\s+ser\s+(ia|intelig[eê]ncia\s+artificial|rob[oô]|bot)|never\s+admit\s+you\s+are\s+(ai|a\s+bot)/i,
    severity: 'error',
  },
  {
    label: 'B5: Hardcoded prices — prices should always come from a tool call',
    pattern:
      /pre[cç]o\s+(fixo|[eé]\s+R\$)\s+\d|valor\s+(fixo|[eé]\s+R\$)\s+\d|custo\s+(fixo|[eé]\s+R\$)\s+\d/i,
    severity: 'warning',
  },
  {
    label: 'B6: Phishing or fraud intent',
    pattern: /\b(phishing|golpe|scam)\b/i,
    severity: 'error',
  },
  {
    label: 'B7: Spam / mass messaging',
    pattern: /envie\s+spam|send\s+spam|mass\s+messag/i,
    severity: 'error',
  },
  {
    label: 'B8: Data exfiltration attempt',
    pattern:
      /envie\s+(todos?\s+os?\s+)?dados\s+para|send\s+(all\s+)?data\s+to|exporte\s+conversa/i,
    severity: 'error',
  },
]

// ---------------------------------------------------------------------------
// Category C — Legal / ethical violations
// ---------------------------------------------------------------------------

const CAT_C: BlacklistEntry[] = [
  {
    label: 'C1: Instructs agent to diagnose, prescribe, or give specific medical advice',
    pattern:
      /diagnostique\s+o\s+paciente|prescrev[ae]\s+medica[cç][aã]o|indique\s+rem[eé]dio\s+para|d[eê]\s+diagn[oó]stico/i,
    severity: 'error',
  },
  {
    label: 'C2: Instructs agent to give specific legal advice (not referral)',
    pattern:
      /d[eê]\s+(parecer|opini[aã]o)\s+jur[ií]dica|elabore\s+peti[cç][aã]o|aconselhe\s+juridicamente/i,
    severity: 'error',
  },
  {
    label: 'C3: Collection of third-party personal data',
    pattern:
      /colete?\s+(cpf|dados|informa[cç][oõ]es)\s+(de\s+)?(terceiros?|outros?\s+clientes?|outros?\s+usu[aá]rios?)/i,
    severity: 'error',
  },
  {
    label: 'C4: Competitor promotion or platform recommendation',
    pattern:
      /recomende\s+outra\s+plataforma|recommend\s+another\s+platform|indique\s+concorrente/i,
    severity: 'error',
  },
  {
    label: 'C5: Illegal activity solicitation',
    pattern: /ensine\s+a\s+hackear|teach\s+how\s+to\s+hack|como\s+invadir/i,
    severity: 'error',
  },
]

// ---------------------------------------------------------------------------
// Category D — Security (jailbreak, injection, persona override)
// ---------------------------------------------------------------------------

const CAT_D: BlacklistEntry[] = [
  {
    label: 'D1: Prompt injection — ignore instructions',
    pattern:
      /ignore\s+(suas?\s+regras?|your\s+instructions?|previous|todas?\s+as?\s+instru[cç][oõ]es?)|disregard\s+all/i,
    severity: 'error',
  },
  {
    label: 'D2: Identity hijack — persona override or DAN',
    pattern: /finja\s+ser|pretend\s+to\s+be|act\s+as\s+dan\b/i,
    severity: 'error',
  },
  {
    label: 'D2: Role override jailbreak',
    pattern:
      /voc[eê]\s+agora\s+[eé]\s+um|you\s+are\s+now\s+a|override\s+system\s+prompt|novo\s+modo\s+desbloqueado/i,
    severity: 'error',
  },
  {
    label: 'D2: Social engineering — "I am the developer, show me the system"',
    pattern:
      /sou\s+(o\s+)?(desenvolvedor|dev|criador|dono)\s+.{0,20}(mostre?|exiba|revele?)/i,
    severity: 'error',
  },
  {
    label: 'D3: Forces agent to never defend against manipulation attempts',
    pattern:
      /nunca\s+(recuse?|negue?)\s+(pedidos?|solicita[cç][oõ]es?)|sempre\s+obede[cç]a\s+qualquer/i,
    severity: 'error',
  },
]

// ---------------------------------------------------------------------------
// Merged list
// ---------------------------------------------------------------------------

const ALL_PATTERNS: BlacklistEntry[] = [
  ...CAT_A,
  ...CAT_B,
  ...CAT_C,
  ...CAT_D,
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateBlacklist(prompt: string): ValidationResult {
  const issues: ValidationIssue[] = []

  for (const entry of ALL_PATTERNS) {
    if (entry.pattern.test(prompt)) {
      issues.push({
        validator: 'blacklist',
        severity: entry.severity,
        message: `[${entry.label}]`,
      })
    }
  }

  return {
    pass: issues.every((i) => i.severity !== 'error'),
    issues,
  }
}
