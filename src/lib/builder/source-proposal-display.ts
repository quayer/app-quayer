import type { SourceProposal } from "@/server/ai-module/builder/cards/builder-state"

const BROKEN_DISTANCE_PATTERN = /\ba\s+minuto\(s\)\s+do\(a\)\s+(.+)$/i
const SOLD_OUT_PATTERN =
  /\b(?:100\s*%\s*)?vendid[oa]s?\b|\besgotad[oa]s?\b|\bindispon[ií]vel\b/i
const STRONG_SOLD_OUT_PATTERN = /\b100\s*%\s*vendid[oa]s?\b/i

export function normalizeSourceProposalText(value: string): string {
  const text = value.trim().replace(/\s+/g, " ")
  if (!text) return ""

  const brokenDistance = text.match(BROKEN_DISTANCE_PATTERN)
  if (brokenDistance) {
    const destination = normalizeTransitDestination(brokenDistance[1])
    if (destination) return `próximo ${transitPreposition(destination)}`
  }

  return text
}

export function normalizeSourceProposalItems(
  items: readonly string[] | undefined,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of items ?? []) {
    const normalized = normalizeSourceProposalText(item)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

export function sourceProposalAvailabilityWarning(
  proposal: SourceProposal,
): string | null {
  const text = [
    proposal.businessName,
    proposal.audience,
    proposal.tone,
    proposal.address,
    proposal.description,
    ...(proposal.services ?? []),
    ...(proposal.differentiators ?? []),
  ]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))
    .join(" ")

  if (!SOLD_OUT_PATTERN.test(text)) return null

  if (STRONG_SOLD_OUT_PATTERN.test(text)) {
    return "A fonte indica 100% vendido. Confirme se o SDR deve captar lista de espera, indicar alternativas ou bloquear venda direta."
  }

  return "A fonte indica disponibilidade limitada ou indisponível. Confirme a oferta antes de montar o SDR."
}

function normalizeTransitDestination(value: string): string {
  const text = value.trim().replace(/\s+/g, " ")
  if (!text) return ""

  return text === text.toLocaleUpperCase("pt-BR")
    ? toTitleCasePt(text)
    : text
        .replace(/\bESTAÇÃO\b/gi, "Estação")
        .replace(/\bLINHA\b/gi, "Linha")
        .replace(/BUTANTÃ/g, "Butantã")
        .replace(/\bAMARELA\b/g, "Amarela")
}

function transitPreposition(destination: string): string {
  if (/^Estação\b/i.test(destination)) return `à ${destination}`
  return `a ${destination}`
}

function toTitleCasePt(value: string): string {
  const lower = value.toLocaleLowerCase("pt-BR")
  return lower.replace(/(^|[\s(/-])(\p{L})/gu, (_match, prefix, letter) => {
    return `${prefix}${letter.toLocaleUpperCase("pt-BR")}`
  })
}
