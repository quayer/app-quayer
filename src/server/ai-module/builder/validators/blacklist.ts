/**
 * US-011: Prompt Blacklist Validator
 *
 * Hardcoded regex patterns (pt-BR + en) that detect prompt-injection,
 * social-engineering, spam, and competitor-mention attempts.
 *
 * Every match produces an **error** (blocks publishing).
 */

import type { ValidationIssue, ValidationResult } from './index'

// ---------------------------------------------------------------------------
// Blocked pattern definitions
// ---------------------------------------------------------------------------

interface BlacklistEntry {
  /** Human-readable label for the issue message */
  label: string
  /** Case-insensitive regex (applied with the `i` flag) */
  pattern: RegExp
}

const BLOCKED_PATTERNS: BlacklistEntry[] = [
  // 1. Prompt injection — ignore instructions
  {
    label: 'Prompt injection: ignore instructions',
    pattern:
      /ignore\s+(suas?\s+regras|your\s+instructions|previous|todas?\s+as?\s+instru[cç][oõ]es)|disregard\s+all/i,
  },
  // 2. Prompt leak — reveal system prompt
  {
    label: 'Prompt leak: reveal system prompt',
    pattern:
      /mostre\s+suas?\s+instru[cç][oõ]es|show\s+your\s+instructions|reveal\s+your\s+prompt|exiba\s+seu\s+prompt/i,
  },
  // 3. Identity hijack — pretend to be / DAN
  {
    label: 'Identity hijack: persona override',
    pattern: /finja\s+ser|pretend\s+to\s+be|act\s+as\s+dan\b/i,
  },
  // 4. Deny AI identity
  {
    label: 'Deception: deny AI identity',
    pattern:
      /nunca\s+admita\s+ser\s+(ia|intelig[eê]ncia\s+artificial)|never\s+admit\s+you\s+are\s+ai/i,
  },
  // 5. False guarantees
  {
    label: 'False guarantees / misleading claims',
    pattern: /garantia\s+de\s+resultado|100%\s+aprovado|guaranteed\s+results/i,
  },
  // 6. Phishing / fraud
  {
    label: 'Phishing or fraud intent',
    pattern: /\b(phishing|golpe|scam)\b/i,
  },
  // 7. Spam / mass messaging
  {
    label: 'Spam / mass messaging',
    pattern: /envie\s+spam|send\s+spam|mass\s+messag/i,
  },
  // 8. Sensitive data collection without context
  {
    label: 'Sensitive data collection without legal context',
    pattern: /colete\s+cpf|collect\s+ssn/i,
  },
  // 9. Competitor promotion
  {
    label: 'Competitor promotion',
    pattern:
      /recomende\s+outra\s+plataforma|recommend\s+another\s+platform|indique\s+concorrente/i,
  },
  // 10. Jailbreak / role override
  {
    label: 'Jailbreak: role override attempt',
    pattern:
      /voc[eê]\s+agora\s+[eé]\s+um|you\s+are\s+now\s+a|override\s+system\s+prompt|novo\s+modo\s+desbloqueado/i,
  },
  // 11. Data exfiltration
  {
    label: 'Data exfiltration attempt',
    pattern:
      /envie\s+(todos?\s+os?\s+)?dados\s+para|send\s+(all\s+)?data\s+to|exporte\s+conversa/i,
  },
  // 12. Illegal activity solicitation
  {
    label: 'Illegal activity solicitation',
    pattern: /ensine\s+a\s+hackear|teach\s+how\s+to\s+hack|como\s+invadir/i,
  },
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateBlacklist(prompt: string): ValidationResult {
  const issues: ValidationIssue[] = []

  for (const entry of BLOCKED_PATTERNS) {
    if (entry.pattern.test(prompt)) {
      issues.push({
        validator: 'blacklist',
        severity: 'error',
        message: `Blocked pattern detected: ${entry.label}`,
      })
    }
  }

  return {
    pass: issues.length === 0,
    issues,
  }
}
