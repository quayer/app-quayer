import type { PromptInsights } from "./prompt-types"

export function analyzePrompt(text: string): PromptInsights {
  const charCount = text.length
  const lines = text.split("\n")
  const lineCount = lines.length
  const sectionCount = lines.filter((l) => /^#{1,4}\s/.test(l.trim())).length
  const estimatedTokens = Math.round(charCount / 4)

  const hasIdentity =
    /voc[eê]\s+[eé]/i.test(text) ||
    /seu nome/i.test(text) ||
    /# identidade/i.test(text)
  const hasInstructions =
    /# instru[cç][oõ]es/i.test(text) ||
    /deve[m]?\s/i.test(text) ||
    charCount > 200
  const hasRestrictions =
    /nunca|n[aã]o\s+(pode|deve|fa[cç]a)/i.test(text) ||
    /# restri/i.test(text)
  const hasTone =
    /tom\s*:/i.test(text) ||
    /personalidade/i.test(text) ||
    /# tom/i.test(text)

  return {
    charCount,
    lineCount,
    sectionCount,
    estimatedTokens,
    hasIdentity,
    hasInstructions,
    hasRestrictions,
    hasTone,
  }
}

export function formatNumber(n: number): string {
  return n.toLocaleString("pt-BR")
}
