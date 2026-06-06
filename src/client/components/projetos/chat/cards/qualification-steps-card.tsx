"use client"

/**
 * Builder Cards — qualification_steps (Orayon Uplift, W3)
 *
 * Ordered, reorderable list of the qualifying questions the agent asks BEFORE
 * running the qualification action (notify_team / book_appointment / lead_only).
 * The meta-agent drafts sensible defaults into `builderState.qualification.steps`;
 * this card lets the user edit / reorder / add / remove (capped at MAX_STEPS) and
 * confirm.
 *
 * PRESENTATIONAL ONLY: pre-fills from `props.value.qualification.steps`, and on
 * confirm fires `props.onSubmit({ steps })` UP to chat-panel (it owns POST + SSE).
 * Never fetches. Styling = CardShell chrome + the token idiom lifted from the
 * existing chat-panel cards (token-driven inline styles, no hard-coded colors).
 *
 * Contract: cardKey 'qualification_steps' → payload { steps: string[] }
 *           → builderState.qualification.steps → confirmations.qualificationSteps
 */

import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  ListChecks,
  Plus,
  X,
} from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { CardComponentProps } from "./types"
import { CardShell } from "./card-shell"
import {
  classifyStep,
  PROVENANCE_BADGE,
  type StepProvenance,
} from "./qualification/step-provenance"

/** Exact submit payload for cardKey 'qualification_steps'. */
export interface QualificationStepsPayload {
  steps: string[]
}

/** Upper bound the spec calls out (~10 questions before the action). */
const MAX_STEPS = 10

/** Stable row identity so reordering/editing does not remount inputs. */
interface StepRow {
  id: string
  text: string
}

let rowSeq = 0
function makeRow(text: string): StepRow {
  rowSeq += 1
  return { id: `step-${rowSeq}`, text }
}

/**
 * Token colors for the DISPLAY-ONLY provenance pill. Strictly token-driven (no
 * hard-coded hex). Recomputed per-keystroke at render; NEVER serialized — the
 * submit payload stays exactly `{ steps: string[] }`.
 */
function badgeStyle(
  provenance: StepProvenance,
  tokens: AppTokens,
): { backgroundColor: string; color: string } {
  switch (provenance) {
    case "bant":
      return { backgroundColor: tokens.brandSubtle, color: tokens.brand }
    case "playbook":
      return {
        backgroundColor: tokens.successSubtle,
        color: tokens.successText,
      }
    case "state":
      return {
        backgroundColor: tokens.warningSubtle,
        color: tokens.warningText,
      }
    case "custom":
      return { backgroundColor: tokens.hoverBg, color: tokens.textTertiary }
  }
}

/**
 * QualificationStepsCard — ordered list editor for the qualifying questions.
 * Reads its slice from the canonical BuilderState (`value.qualification.steps`)
 * and submits `{ steps }`.
 */
export function QualificationStepsCard({
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<QualificationStepsPayload>) {
  // Seed once from the canonical slice. The LLM drafts defaults here; later
  // re-renders keep the user's local edits (the card owns its working copy).
  const [rows, setRows] = React.useState<StepRow[]>(() => {
    const seeds = value.qualification.steps.filter(
      (step) => step.trim().length > 0,
    )
    return seeds.length > 0 ? seeds.map(makeRow) : [makeRow("")]
  })

  const updateRow = React.useCallback((id: string, text: string) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, text } : row)),
    )
  }, [])

  const removeRow = React.useCallback((id: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id)
      // Never collapse to an empty list — keep one editable row.
      return next.length > 0 ? next : [makeRow("")]
    })
  }, [])

  const addRow = React.useCallback(() => {
    setRows((current) =>
      current.length >= MAX_STEPS ? current : [...current, makeRow("")],
    )
  }, [])

  const moveRow = React.useCallback((index: number, delta: -1 | 1) => {
    setRows((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }, [])

  // Native HTML5 drag-to-reorder. COMPLEMENTS the arrow buttons (kept for
  // keyboard a11y) — both mutate only the local StepRow[] order; the submit
  // payload is unchanged (array order is already the meaningful contract).
  const [dragId, setDragId] = React.useState<string | null>(null)

  const reorderRow = React.useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return
    setRows((current) => {
      const from = current.findIndex((row) => row.id === fromId)
      const to = current.findIndex((row) => row.id === toId)
      if (from < 0 || to < 0) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  // Trim + drop blanks only at submit time so intermediate typing is untouched.
  const cleanedSteps = React.useMemo(
    () =>
      rows
        .map((row) => row.text.trim())
        .filter((text) => text.length > 0),
    [rows],
  )

  const canAdd = rows.length < MAX_STEPS && !disabled
  const canConfirm = cleanedSteps.length > 0 && !disabled

  const handleConfirm = React.useCallback(() => {
    if (cleanedSteps.length === 0) return
    onSubmit({ steps: cleanedSteps })
  }, [cleanedSteps, onSubmit])

  const inputStyle: React.CSSProperties = {
    backgroundColor: tokens.bgBase,
    borderColor: tokens.divider,
    color: tokens.textPrimary,
  }

  const iconBtnBase =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40"

  return (
    <CardShell
      icon={<ListChecks className="h-4 w-4" />}
      title="Perguntas de qualificação"
      reason="Defina, em ordem, o que o agente pergunta antes de executar a ação de qualificação. Arraste pela alça ou use as setas para reordenar. A etiqueta indica a origem de cada pergunta."
      tokens={tokens}
      actions={[
        {
          label: "Confirmar perguntas",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled: !canConfirm,
        },
        ...(onDismiss
          ? [
              {
                label: "Agora não",
                onClick: onDismiss,
                variant: "secondary" as const,
                disabled,
              },
            ]
          : []),
      ]}
    >
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => {
          // DISPLAY-ONLY: recomputed every render (live as the user types).
          // NEVER serialized — purely the provenance pill's label/color.
          const provenance = classifyStep(row.text)
          const badge = PROVENANCE_BADGE[provenance]
          const isDragging = dragId === row.id
          return (
            <div
              key={row.id}
              className="flex items-center gap-2 rounded-md transition-opacity"
              style={{ opacity: isDragging ? 0.5 : 1 }}
              onDragOver={(event) => {
                if (dragId && dragId !== row.id) event.preventDefault()
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragId) reorderRow(dragId, row.id)
                setDragId(null)
              }}
            >
              <button
                type="button"
                draggable={!disabled}
                onDragStart={() => setDragId(row.id)}
                onDragEnd={() => setDragId(null)}
                disabled={disabled}
                aria-label={`Arrastar para reordenar pergunta ${index + 1}`}
                className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                style={{ color: tokens.textTertiary }}
              >
                <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold"
                style={{
                  backgroundColor: tokens.brandSubtle,
                  color: tokens.brand,
                }}
                aria-hidden="true"
              >
                {index + 1}
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <input
                  type="text"
                  value={row.text}
                  disabled={disabled}
                  onChange={(event) => updateRow(row.id, event.target.value)}
                  placeholder={`Pergunta ${index + 1} (ex.: "Qual o tamanho da sua empresa?")`}
                  aria-label={`Pergunta de qualificação ${index + 1}`}
                  className="h-9 w-full min-w-0 rounded-md border px-3 text-[13px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={inputStyle}
                />
                {row.text.trim().length > 0 && (
                  <span
                    className="w-fit rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={badgeStyle(provenance, tokens)}
                    title={badge.hint}
                  >
                    {badge.label}
                  </span>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => moveRow(index, -1)}
                  aria-label={`Subir pergunta ${index + 1}`}
                  className={iconBtnBase}
                  style={{
                    backgroundColor: tokens.bgBase,
                    borderColor: tokens.divider,
                    color: tokens.textSecondary,
                  }}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={disabled || index === rows.length - 1}
                  onClick={() => moveRow(index, 1)}
                  aria-label={`Descer pergunta ${index + 1}`}
                  className={iconBtnBase}
                  style={{
                    backgroundColor: tokens.bgBase,
                    borderColor: tokens.divider,
                    color: tokens.textSecondary,
                  }}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeRow(row.id)}
                  aria-label={`Remover pergunta ${index + 1}`}
                  className={iconBtnBase}
                  style={{
                    backgroundColor: tokens.bgBase,
                    borderColor: tokens.divider,
                    color: tokens.textTertiary,
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canAdd}
          onClick={addRow}
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            backgroundColor: tokens.bgBase,
            borderColor: tokens.divider,
            color: tokens.textSecondary,
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar pergunta
        </button>
        <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
          {rows.length}/{MAX_STEPS}
        </span>
      </div>
    </CardShell>
  )
}

export default QualificationStepsCard
