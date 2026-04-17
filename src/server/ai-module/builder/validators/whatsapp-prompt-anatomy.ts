/**
 * US-010: Prompt Anatomy Validator
 *
 * Pure function (no LLM) that checks whether a prompt contains
 * the required structural sections defined by Quayer's prompt anatomy.
 *
 * Required sections (at least one synonym must be present):
 *  - Papel / Persona / Identity / Identidade
 *  - Objetivo / Goal / Missao
 *  - Regras / Rules / Conduta
 *  - Limitacoes / Limits / Restricoes / "O que NAO"
 *  - Format Tags (internal section — always expected)
 *
 * Warns (does not block) if any visible section exceeds 400 words.
 */

import type { ValidationIssue, ValidationResult } from './index'

// ---------------------------------------------------------------------------
// Section definitions — each entry has a canonical name + regex alternations
// ---------------------------------------------------------------------------

interface SectionDef {
  name: string
  pattern: RegExp
}

const REQUIRED_SECTIONS: SectionDef[] = [
  {
    name: 'Papel/Persona/Identity',
    pattern: /\b(papel|persona|identity|identidade)\b/i,
  },
  {
    name: 'Objetivo/Goal/Missao',
    pattern: /\b(objetivo|goal|miss[aã]o)\b/i,
  },
  {
    name: 'Regras/Rules/Conduta',
    pattern: /\b(regras?|rules?|conduta)\b/i,
  },
  {
    name: 'Limitacoes/Limits/Restricoes',
    pattern: /\b(limita[cç][oõ]es|limits?|restri[cç][oõ]es|o\s+que\s+n[aã]o)\b/i,
  },
  {
    name: 'Formato/Format Tags',
    pattern: /\b(formato|format\s*tags?|formato\s+de\s+resposta)\b/i,
  },
]

// ---------------------------------------------------------------------------
// Word-count helper
// ---------------------------------------------------------------------------

const SECTION_HEADING_RE = /^#{1,3}\s+.+$/gm

function countWordsInLargestSection(prompt: string): number {
  const headings = [...prompt.matchAll(SECTION_HEADING_RE)]

  if (headings.length === 0) {
    // No headings — treat the whole prompt as one section
    return prompt.split(/\s+/).filter(Boolean).length
  }

  let maxWords = 0

  for (let i = 0; i < headings.length; i++) {
    const start = (headings[i].index ?? 0) + headings[i][0].length
    const end = i + 1 < headings.length ? headings[i + 1].index : prompt.length
    const sectionText = prompt.slice(start, end)
    const wordCount = sectionText.split(/\s+/).filter(Boolean).length
    if (wordCount > maxWords) {
      maxWords = wordCount
    }
  }

  return maxWords
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const WORD_LIMIT = 400

export function validateAnatomy(prompt: string): ValidationResult {
  const issues: ValidationIssue[] = []

  // Check each required section
  for (const section of REQUIRED_SECTIONS) {
    if (!section.pattern.test(prompt)) {
      issues.push({
        validator: 'anatomy',
        severity: 'error',
        message: `Missing required section: ${section.name}`,
      })
    }
  }

  // Warn if any visible section exceeds word limit
  const maxWords = countWordsInLargestSection(prompt)
  if (maxWords > WORD_LIMIT) {
    issues.push({
      validator: 'anatomy',
      severity: 'warning',
      message: `A section exceeds ${WORD_LIMIT} words (found ~${maxWords} words). Consider splitting for clarity.`,
    })
  }

  return {
    pass: issues.every((i) => i.severity !== 'error'),
    issues,
  }
}
