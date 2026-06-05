/**
 * Builder Chat — Journey Banner (Orayon Uplift, W2 foundation)
 *
 * PURE renderer that turns a `Readiness` snapshot (from the deterministic
 * step-engine, `state/readiness.types.ts`) plus the current `stateSummary`
 * into the per-turn Markdown banner injected at the `stream-agent-response.ts`
 * chokepoint (Stage 3 consumes this — DO NOT wire it here).
 *
 * Sections, in order:
 *   # PRÓXIMO PASSO         — step.title + step.ask (the one question to ask now)
 *   # PRONTIDÃO             — completenessPct, isDeployReady, blockers
 *   # REGRAS DE JORNADA     — BUILDER_JOURNEY_RULES (free-text behavior)
 *   # CAMPOS: card vs livre — renderFieldOwnership table
 *   # ESTADO ATUAL          — the passed stateSummary
 *
 * Tolerant: `readiness === undefined` (legacy conversations, engine off, or any
 * upstream failure) falls back to a MINIMAL banner with only `# ESTADO ATUAL`,
 * so the existing flow is never broken.
 *
 * No IO, no `any`. Contract: docs/builder/ORAYON_UPLIFT_SPEC.md.
 */

import type { Readiness } from '../../state/readiness.types'
import {
  BUILDER_JOURNEY_RULES,
  renderFieldOwnership,
} from '../../prompts/journey-rules'

// ---------------------------------------------------------------------------
// Section helpers (each returns a finished Markdown block, no trailing newline)
// ---------------------------------------------------------------------------

function renderNextStep(readiness: Readiness): string {
  const step = readiness.step
  const title = step?.title?.trim() || 'Definir próximo passo'
  const ask = step?.ask?.trim()
  const lines = [`# PRÓXIMO PASSO`, title]
  if (ask) lines.push('', ask)

  const missing = (readiness.requiredMissing ?? []).filter(
    (m) => typeof m === 'string' && m.trim().length > 0,
  )
  if (missing.length > 0) {
    lines.push('', 'Campos obrigatórios faltando:')
    for (const field of missing) lines.push(`- \`${field}\``)
  }

  return lines.join('\n')
}

function renderReadiness(readiness: Readiness): string {
  const pct = clampPct(readiness.completenessPct)
  const lines = [`# PRONTIDÃO`, `Completude: ${pct}%`]

  if (readiness.isDeployReady) {
    lines.push('Pronto para publicar: SIM — todos os pré-requisitos atendidos.')
  } else {
    lines.push('Pronto para publicar: NÃO — ainda há pendências.')
  }

  const blockers = readiness.blockers ?? []
  if (blockers.length > 0) {
    lines.push('', 'Bloqueadores:')
    for (const b of blockers) {
      const cta = b.cta ? ` — ${b.cta}` : ''
      lines.push(`- [${b.check}] ${b.message}${cta}`)
    }
  }

  return lines.join('\n')
}

function renderRules(): string {
  return `# REGRAS DE JORNADA (livre)\n${BUILDER_JOURNEY_RULES}`
}

function renderOwnership(readiness: Readiness): string {
  return `# CAMPOS: card vs livre\n${renderFieldOwnership(readiness.fieldOwnership)}`
}

function renderState(stateSummary?: string): string {
  const body = stateSummary?.trim()
  return body ? `# ESTADO ATUAL\n${body}` : `# ESTADO ATUAL\n_(sem estado registrado ainda)_`
}

function clampPct(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the per-turn Builder journey banner.
 *
 * @param readiness   deterministic step-engine snapshot. When `undefined`, the
 *                    banner degrades to `# ESTADO ATUAL` only (non-breaking).
 * @param stateSummary current human-readable project state (the existing
 *                    `stateSummary` already threaded through the stream path).
 * @returns Markdown string ready to prepend to the augmented LLM message.
 */
export function buildJourneyBanner(
  readiness: Readiness | undefined,
  stateSummary?: string,
): string {
  if (!readiness) {
    // Minimal, non-breaking fallback: just the current state.
    return renderState(stateSummary)
  }

  return [
    renderNextStep(readiness),
    renderReadiness(readiness),
    renderRules(),
    renderOwnership(readiness),
    renderState(stateSummary),
  ].join('\n\n')
}
