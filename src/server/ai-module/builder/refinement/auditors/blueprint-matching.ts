import type {
  BlueprintQuestion,
  BlueprintVariable,
} from '../../playbook/blueprint.schema'
import {
  buildTextIndex,
  hasAnyToken,
  hasPhraseOrCoverage,
  normalizeText,
  tokenCoverage,
  uniqueTokens,
} from './text-matching'

export function questionMatchesTurn(
  question: BlueprintQuestion,
  variable: BlueprintVariable | undefined,
  content: string,
): boolean {
  const index = buildTextIndex(content)

  if (hasPhraseOrCoverage(index, question.text, 0.5)) return true

  const questionTokens = uniqueTokens(question.text, question.purpose)
  if (questionTokens.length > 0 && tokenCoverage(index, questionTokens) >= 0.5) {
    return true
  }

  const variableTokens = uniqueTokens(question.variableKey, variable?.label ?? '')
  return (
    hasAnyToken(index, variableTokens) &&
    hasAnyToken(index, uniqueTokens(question.text, question.purpose))
  )
}

export function isQuestionLike(content: string): boolean {
  if (content.includes('?')) return true

  return /\b(qual|quais|quando|onde|como|quanto|quantos|quem|poderia|pode|tem|possui|deseja|prefere|quer)\b/.test(
    normalizeText(content),
  )
}

export function userTurnLooksKnownForQuestion(
  question: BlueprintQuestion,
  variable: BlueprintVariable | undefined,
  content: string,
): boolean {
  const normalized = normalizeText(content)
  const index = buildTextIndex(content)
  const variableTokens = uniqueTokens(
    question.variableKey,
    variable?.label ?? '',
    question.purpose,
  )
  const hasTopic = hasAnyToken(index, variableTokens)

  if (variable?.type === 'email') {
    return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(content)
  }

  if (variable?.type === 'phone') {
    return /(?:\+?\d[\s().-]?){8,}/.test(content)
  }

  if (variable?.type === 'currency' || variable?.type === 'number') {
    return (
      /\b(r\$|rs|\d+[\d.,]*\s*(mil|k|reais?|mi|milhao|milhoes)?)\b/i.test(
        content,
      ) && (hasTopic || hasAnyToken(index, uniqueTokens(question.text)))
    )
  }

  if (variable?.type === 'date') {
    return (
      /\b(hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|\d{1,2}\/\d{1,2})\b/.test(
        normalized,
      ) && (hasTopic || hasAnyToken(index, uniqueTokens(question.text)))
    )
  }

  if (variable?.type === 'time') {
    return (
      /\b(\d{1,2}h|\d{1,2}:\d{2}|manha|tarde|noite)\b/.test(normalized) &&
      (hasTopic || hasAnyToken(index, uniqueTokens(question.text)))
    )
  }

  if (variable?.type === 'location') {
    return (
      /\b(bairro|regiao|cidade|zona|centro|em|no|na)\b/.test(normalized) &&
      (hasTopic || hasAnyToken(index, uniqueTokens(question.text)))
    )
  }

  if (variable?.type === 'boolean') {
    return /\b(sim|nao|tenho|nao tenho|quero|nao quero|prefiro)\b/.test(
      normalized,
    )
  }

  const contentTokens = uniqueTokens(content)
  if (contentTokens.length < 2) return false

  return (
    hasTopic ||
    tokenCoverage(index, uniqueTokens(question.text, question.purpose)) >= 0.25
  )
}
