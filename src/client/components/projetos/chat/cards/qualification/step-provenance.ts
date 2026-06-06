/**
 * Builder Cards — qualification step provenance (Onda C, G8)
 *
 * PURE display heuristic (no React, no IO, no `any`, never throws). Classifies a
 * qualification question into a provenance bucket purely from its TEXT so the
 * card can render a small "where did this come from?" pill next to each row.
 *
 * LOAD-BEARING CONTRACT NOTE: this is DISPLAY-ONLY. The provenance is recomputed
 * live on every keystroke and is NEVER serialized — the submit payload stays
 * EXACTLY `{ steps: string[] }`. The persisted `qualification.steps` is read
 * downstream only as a flat `string[]` (next-pending-step presence/length check,
 * `applyQualificationSteps` → `sanitizeStringList`, prompt builders), so the
 * badge cannot and does not live inside the persisted strings.
 *
 * Buckets mirror Orayon's `qualificationStepsHelpers.ts` BADGE intent:
 *   - 'bant'     → budget / authority / need / timing language
 *   - 'playbook' → common, generic qualifying questions (name, contact, segment…)
 *   - 'state'    → questions referencing what the user/lead already told us
 *   - 'custom'   → anything else (the user's own bespoke question)
 */

export type StepProvenance = "bant" | "playbook" | "state" | "custom"

/**
 * Normalize for keyword matching: lowercase, strip diacritics, collapse
 * whitespace. Deterministic and allocation-light; never throws on any input
 * (including empty strings).
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Substring keyword sets per bucket (already diacritic-free / lowercase). */
const BANT_KEYWORDS: readonly string[] = [
  "orcamento",
  "budget",
  "investiment",
  "quanto pretende",
  "quanto pode",
  "faixa de preco",
  "faixa de valor",
  "verba",
  "valor disponivel",
  "autoridade",
  "decisor",
  "quem decide",
  "quem aprova",
  "responsavel pela decisao",
  "necessidade",
  "qual o problema",
  "qual sua dor",
  "o que procura",
  "o que voce precisa",
  "objetivo",
  "prazo",
  "quando pretende",
  "ate quando",
  "urgencia",
  "timing",
]

const PLAYBOOK_KEYWORDS: readonly string[] = [
  "qual seu nome",
  "qual o seu nome",
  "como posso te chamar",
  "seu nome",
  "nome completo",
  "email",
  "e-mail",
  "telefone",
  "whatsapp",
  "melhor horario",
  "como conheceu",
  "de onde voce",
  "qual cidade",
  "qual regiao",
  "segmento",
  "ramo",
  "tamanho da empresa",
  "quantos funcionarios",
  "qual servico",
  "qual produto",
]

const STATE_KEYWORDS: readonly string[] = [
  "como mencionou",
  "voce disse",
  "voce falou",
  "voce comentou",
  "conforme combinamos",
  "que voce comentou",
  "que voce mencionou",
  "como conversamos",
  "voce informou",
]

function matchesAny(text: string, keywords: readonly string[]): boolean {
  for (const keyword of keywords) {
    if (text.includes(keyword)) return true
  }
  return false
}

/**
 * Classify a single qualification question into a provenance bucket from its
 * text alone. Precedence: state (references prior context) → bant (sales
 * qualifying intent) → playbook (generic onboarding question) → custom.
 * Pure, total, never throws — empty/whitespace returns 'custom'.
 */
export function classifyStep(text: string): StepProvenance {
  const normalized = normalize(text)
  if (normalized.length === 0) return "custom"
  if (matchesAny(normalized, STATE_KEYWORDS)) return "state"
  if (matchesAny(normalized, BANT_KEYWORDS)) return "bant"
  if (matchesAny(normalized, PLAYBOOK_KEYWORDS)) return "playbook"
  return "custom"
}

/**
 * PT-BR label + hover hint per bucket. The card maps each bucket to token colors
 * at render time (this file stays color-free / token-free / React-free).
 */
export const PROVENANCE_BADGE: Record<
  StepProvenance,
  { label: string; hint: string }
> = {
  bant: {
    label: "BANT",
    hint: "Pergunta de qualificação comercial (orçamento, decisão, necessidade ou prazo).",
  },
  playbook: {
    label: "Padrão",
    hint: "Pergunta comum de atendimento — ajuste o que quiser.",
  },
  state: {
    label: "Sua pergunta",
    hint: "Referencia algo que o lead já te contou na conversa.",
  },
  custom: {
    label: "Personalizada",
    hint: "Pergunta sua, específica do seu negócio.",
  },
}
