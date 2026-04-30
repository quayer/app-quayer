/**
 * US-012 (part 1): Ambiguity Detector
 *
 * Heuristic-only (no LLM) — detects contradictions and vague instructions
 * in the prompt. Returns **warnings** only (never blocks).
 */

import type { ValidationIssue, ValidationResult } from './index'

// ---------------------------------------------------------------------------
// Contradiction pairs — if BOTH sides match, warn
// ---------------------------------------------------------------------------

interface ContradictionPair {
  label: string
  a: RegExp
  b: RegExp
}

const CONTRADICTION_PAIRS: ContradictionPair[] = [
  {
    label: '"formal" tone conflicts with slang/informal language',
    a: /\b(formal|profissional)\b/i,
    b: /\b(g[ií]rias?|slang|informal|coloquial)\b/i,
  },
  {
    label: '"never mention price" conflicts with "present values/pricing"',
    a: /nunca\s+fale\s+de\s+pre[cç]o|never\s+mention\s+pric/i,
    b: /apresente\s+valores|show\s+pric|informe\s+pre[cç]o|display\s+values/i,
  },
  {
    label: '"never transfer to human" conflicts with "escalate to human agent"',
    a: /nunca\s+transfira|never\s+transfer\s+to\s+human/i,
    b: /transfira\s+para\s+humano|escalate\s+to\s+human|transfer_to_human/i,
  },
  {
    label: '"respond only in Portuguese" conflicts with "respond in English"',
    a: /responda?\s+(somente|apenas|s[oó])\s+(em\s+)?portugu[eê]s/i,
    b: /responda?\s+(em\s+)?ingl[eê]s|respond\s+in\s+english/i,
  },
]

// ---------------------------------------------------------------------------
// Vague instruction patterns — if matched, warn
// ---------------------------------------------------------------------------

interface VaguePattern {
  label: string
  pattern: RegExp
}

const VAGUE_PATTERNS: VaguePattern[] = [
  {
    label: '"atenda bem" is too vague — specify what good service looks like',
    pattern: /\batenda\s+bem\b/i,
  },
  {
    label: '"seja bom" is too vague — specify desired behavior',
    pattern: /\bseja\s+bom\b/i,
  },
  {
    label: '"responda corretamente" is too vague — define what correct means',
    pattern: /\bresponda\s+corretamente\b/i,
  },
  {
    label: '"be helpful" is too vague — specify the kind of help expected',
    pattern: /\bbe\s+helpful\b/i,
  },
  {
    label: '"do your best" is too vague — define success criteria',
    pattern: /\b(fa[cç]a\s+o\s+seu\s+melhor|do\s+your\s+best)\b/i,
  },
  {
    label: '"be nice" is too vague — specify tone and boundaries',
    pattern: /\b(seja\s+legal|be\s+nice)\b/i,
  },
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateAmbiguity(prompt: string): ValidationResult {
  const issues: ValidationIssue[] = []

  // Contradictions
  for (const pair of CONTRADICTION_PAIRS) {
    if (pair.a.test(prompt) && pair.b.test(prompt)) {
      issues.push({
        validator: 'ambiguity',
        severity: 'warning',
        message: `Potential contradiction: ${pair.label}`,
      })
    }
  }

  // Vague instructions
  for (const vague of VAGUE_PATTERNS) {
    if (vague.pattern.test(prompt)) {
      issues.push({
        validator: 'ambiguity',
        severity: 'warning',
        message: `Vague instruction: ${vague.label}`,
      })
    }
  }

  return {
    pass: true, // ambiguity never blocks — warnings only
    issues,
  }
}
