"use client"

import { useMemo } from "react"
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react"
import { Card, CardContent } from "@/client/components/ui/card"
import type { ChatMessage } from "@/client/components/projetos/types"
import type { AppTokens, PromptInsights } from "./prompt-types"
import { formatNumber } from "./prompt-utils"
import {
  getLatestPromptAnatomy,
  type PromptAnatomyResult,
} from "./helpers/extract-anatomy"

interface PromptInsightsSectionProps {
  tokens: AppTokens
  insights: PromptInsights
  /** Full chat history; mined for `generate_prompt_anatomy` tool results. */
  messages?: ChatMessage[]
  open: boolean
  onToggle: () => void
}

export function PromptInsightsSection({
  tokens,
  insights,
  messages,
  open,
  onToggle,
}: PromptInsightsSectionProps) {
  const anatomy = useMemo(
    () => (messages ? getLatestPromptAnatomy(messages) : null),
    [messages],
  )

  return (
    <Card
      className="border p-0 shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3"
        onClick={onToggle}
      >
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tokens.textTertiary }}
        >
          Analise do prompt
        </span>
        {open ? (
          <ChevronUp
            className="h-3.5 w-3.5"
            style={{ color: tokens.textTertiary }}
          />
        ) : (
          <ChevronDown
            className="h-3.5 w-3.5"
            style={{ color: tokens.textTertiary }}
          />
        )}
      </button>

      {open && (
        <CardContent
          className="border-t px-4 pb-4 pt-3"
          style={{ borderColor: tokens.divider }}
        >
          {/* Metrics row */}
          <div className="mb-3 flex flex-wrap gap-4">
            <InsightMetric
              tokens={tokens}
              label="Caracteres"
              value={formatNumber(insights.charCount)}
            />
            <InsightMetric
              tokens={tokens}
              label="Linhas"
              value={formatNumber(insights.lineCount)}
            />
            <InsightMetric
              tokens={tokens}
              label="Secoes"
              value={String(insights.sectionCount)}
            />
            <InsightMetric
              tokens={tokens}
              label="Tokens (est.)"
              value={`~${formatNumber(insights.estimatedTokens)}`}
            />
          </div>

          {/* Quality pills (heuristic) */}
          <div className="flex flex-wrap gap-1.5">
            <QualityPill label="Identidade" active={insights.hasIdentity} />
            <QualityPill
              label="Instrucoes"
              active={insights.hasInstructions}
            />
            <QualityPill
              label="Restricoes"
              active={insights.hasRestrictions}
            />
            <QualityPill label="Tom" active={insights.hasTone} />
          </div>

          {/* Builder anatomy — only when the tool ran */}
          {anatomy && (
            <BuilderAnatomyBlock tokens={tokens} anatomy={anatomy} />
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Builder Analysis block
// ---------------------------------------------------------------------------

function BuilderAnatomyBlock({
  tokens,
  anatomy,
}: {
  tokens: AppTokens
  anatomy: PromptAnatomyResult
}) {
  const { sections, validation, score } = anatomy
  // Score color picks. `brandSubtle` (amber in the DS) is already the "good"
  // accent; there's no warningSubtle/dangerSubtle token, so we use inline
  // rgba() with a comment — matches the pattern used by QualityPill below.
  const scoreStyle = scoreStyleFor(score, tokens)

  return (
    <div
      className="mt-4 border-t pt-3"
      style={{ borderColor: tokens.divider }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles
          className="h-3.5 w-3.5"
          style={{ color: tokens.brand }}
          aria-hidden="true"
        />
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tokens.textTertiary }}
        >
          Analise do Builder
        </span>
      </div>

      {/* Mini cards: Papel / Objetivo / Score */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <AnatomyCard tokens={tokens} label="Papel" value={sections.papel} />
        <AnatomyCard
          tokens={tokens}
          label="Objetivo"
          value={sections.objetivo}
        />
        <div
          className="flex flex-col rounded-md border px-3 py-2"
          style={{
            backgroundColor: scoreStyle.bg,
            borderColor: scoreStyle.border,
          }}
        >
          <span
            className="text-[10px] font-medium uppercase tracking-[0.12em]"
            style={{ color: tokens.textTertiary }}
          >
            Score
          </span>
          <span
            className="text-[18px] font-semibold tabular-nums"
            style={{ color: scoreStyle.text }}
          >
            {score}
            <span
              className="ml-0.5 text-[11px] font-medium"
              style={{ color: tokens.textTertiary }}
            >
              /100
            </span>
          </span>
        </div>
      </div>

      {/* Regras / Limitações / Formato as pill groups (split by line) */}
      <PillGroup
        tokens={tokens}
        label="Regras"
        items={splitLines(sections.regras)}
      />
      <PillGroup
        tokens={tokens}
        label="Limitacoes"
        items={splitLines(sections.limitacoes)}
      />
      <PillGroup
        tokens={tokens}
        label="Formato"
        items={splitLines(sections.formato)}
      />

      {/* Validation issues */}
      {validation.ran && validation.issues.length > 0 && (
        <div className="mt-2">
          <span
            className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em]"
            style={{ color: tokens.textTertiary }}
          >
            Avisos do validador
          </span>
          <div className="flex flex-col gap-1">
            {validation.issues.slice(0, 5).map((issue, i) => (
              <ValidationBadge
                key={`${issue.validator}-${i}`}
                tokens={tokens}
                severity={issue.severity}
                text={issue.message}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AnatomyCard({
  tokens,
  label,
  value,
}: {
  tokens: AppTokens
  label: string
  value: string
}) {
  if (!value.trim()) return null
  return (
    <div
      className="flex flex-col rounded-md border px-3 py-2"
      style={{
        backgroundColor: tokens.bgBase,
        borderColor: tokens.divider,
      }}
    >
      <span
        className="text-[10px] font-medium uppercase tracking-[0.12em]"
        style={{ color: tokens.textTertiary }}
      >
        {label}
      </span>
      <span
        className="line-clamp-2 text-[12px] font-medium leading-snug"
        style={{ color: tokens.textPrimary }}
      >
        {truncate(value, 110)}
      </span>
    </div>
  )
}

function PillGroup({
  tokens,
  label,
  items,
}: {
  tokens: AppTokens
  label: string
  items: string[]
}) {
  if (items.length === 0) return null
  return (
    <div className="mb-2">
      <span
        className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em]"
        style={{ color: tokens.textTertiary }}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 6).map((item, i) => (
          <span
            key={`${label}-${i}`}
            className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium"
            style={{
              backgroundColor: tokens.bgBase,
              borderColor: tokens.divider,
              color: tokens.textSecondary,
            }}
          >
            {truncate(item, 60)}
          </span>
        ))}
        {items.length > 6 && (
          <span
            className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium"
            style={{ color: tokens.textTertiary }}
          >
            +{items.length - 6}
          </span>
        )}
      </div>
    </div>
  )
}

function ValidationBadge({
  tokens,
  severity,
  text,
}: {
  tokens: AppTokens
  severity: "error" | "warning" | "info"
  text: string
}) {
  // DS v3 has no dedicated warning/danger tokens yet — use inline rgba so the
  // colors read correctly on both light and dark themes without a hard-coded
  // pair. If/when `warningSubtle`/`dangerSubtle` land in useAppTokens, swap.
  const palette =
    severity === "error"
      ? { bg: "rgba(239,68,68,0.10)", text: "#ef4444" }
      : severity === "warning"
        ? { bg: "rgba(234,179,8,0.12)", text: "#eab308" }
        : { bg: tokens.brandSubtle, text: tokens.brandText }
  return (
    <span
      className="inline-flex items-start gap-1 rounded-md px-2 py-1 text-[11px] font-medium leading-snug"
      style={{ backgroundColor: palette.bg, color: palette.text }}
    >
      {text}
    </span>
  )
}

function QualityPill({
  label,
  active,
}: {
  label: string
  active: boolean
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: active
          ? "rgba(34,197,94,0.12)"
          : "rgba(239,68,68,0.10)",
        color: active ? "#22c55e" : "#ef4444",
      }}
    >
      {active ? "\u2713" : "\u2717"} {label}
    </span>
  )
}

function InsightMetric({
  tokens,
  label,
  value,
}: {
  tokens: AppTokens
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col">
      <span
        className="text-[11px] font-medium"
        style={{ color: tokens.textTertiary }}
      >
        {label}
      </span>
      <span
        className="text-[15px] font-semibold tabular-nums"
        style={{ color: tokens.textPrimary }}
      >
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pure helpers (kept local — only used by this section)
// ---------------------------------------------------------------------------

function splitLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\u2022\s]+/, "").trim())
    .filter((line) => line.length > 0)
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}\u2026`
}

function scoreStyleFor(
  score: number,
  tokens: AppTokens,
): { bg: string; border: string; text: string } {
  if (score >= 70) {
    // Good — use brand tokens (amber/cream positive accent in DS v3).
    return {
      bg: tokens.brandSubtle,
      border: tokens.brandBorder,
      text: tokens.brandText,
    }
  }
  if (score >= 40) {
    // Warning — no `warningSubtle` token exists; inline rgba yellow works
    // on both themes. TODO: promote to token once DS v3 ships it.
    return {
      bg: "rgba(234,179,8,0.12)",
      border: "rgba(234,179,8,0.30)",
      text: "#b88a00",
    }
  }
  // Danger — same rationale as warning.
  return {
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.30)",
    text: "#ef4444",
  }
}
