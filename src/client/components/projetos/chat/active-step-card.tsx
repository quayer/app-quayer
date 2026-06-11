"use client"

/**
 * ActiveStepCard — renders the card for the CURRENT journey step as the LAST
 * item of the conversation flow, INSIDE the messages scroll container (single
 * scroll — founder feedback), driven by the deterministic readiness snapshot.
 *
 * FR-17 (jornada-builder-v2): the slot ALSO hosts "reopened" cards — when the
 * user taps "Ajustar" on a section of the final summary, the corresponding
 * card re-renders here pre-filled with the CURRENT builderState so a confirmed
 * decision can be revised. See {@link ActiveStepCard} for the precedence rule.
 */

import * as React from "react"
import { X } from "lucide-react"

import { useAppTokens } from "@/client/hooks/use-app-tokens"

import { getCardDescriptor, getCardForStep } from "./cards/card-registry"
import { parseBuilderState } from "@/server/ai-module/builder/cards/builder-state"
import type { BuilderState } from "@/server/ai-module/builder/cards/builder-state"
import type { CardComponentProps, CardKey } from "./cards/types"
import type { Readiness, StepId } from "@/server/ai-module/builder/state/readiness.types"

/**
 * The canonical BuilderState the active-step card pre-fills from. The readiness
 * endpoint (`getReadiness`) returns the persisted `builderState`; we run it
 * through the dependency-free `parseBuilderState` (never throws) which backfills
 * a fully-defaulted state when it's missing (legacy rows) or malformed.
 */
function resolveBuilderState(readiness: Readiness | undefined): BuilderState {
  const candidate = (readiness as { builderState?: unknown } | undefined)
    ?.builderState
  return parseBuilderState(candidate)
}

/**
 * Card props widened with the FR-17 adjust affordance. Only the summary card
 * (`preview_summary`) declares/consumes `onAdjust`; every other card simply
 * ignores the extra optional prop at runtime. The single render-site cast below
 * exists because the registry stores components against the base
 * `CardComponentProps` contract (types.ts is owned by the cards framework).
 */
type AdjustableCardProps = CardComponentProps & {
  onAdjust?: (cardKey: CardKey) => void
  /** Submissão multi-card (ex.: ativação encadeia silenced_contacts) — só os
   *  cards que declaram a prop a consomem; os demais ignoram. */
  onSubmitCard?: (cardKey: CardKey, payload: Record<string, unknown>) => void
}

/**
 * ActiveStepCard maps `readiness.step.id` (a StepId) onto a registered W3 card
 * via `getCardForStep` and renders it with the canonical BuilderState (`value`),
 * wiring its `onSubmit` to chat-panel's `submitCard(cardKey, payload)` (which
 * owns POST + SSE). Renders nothing when the step has no card (free-text steps
 * like `project_identity`/`objective`, or legacy steps still served inline by
 * ToolCallCard: tools/channel/agent_approval).
 *
 * REOPEN PRECEDENCE (FR-17): when `reopenedCardKey` is set, the reopened card
 * SUBSTITUTES the active-step card in this single in-flow slot — no stacking
 * (the simplest rule). The active step resumes the moment the reopen closes
 * (close button below, the card's own dismiss, or a successful re-submit —
 * handled in use-chat-stream). Closing never sends a chat message. Re-submit
 * uses the SAME card-submit endpoint; the step-engine is unaffected (the
 * confirmation sentinel was already true and stays true).
 *
 * The card payload is typed per-card; the registry stores components as
 * `CardComponentProps<unknown>`, so the bound `onSubmit` accepts the card's
 * payload as `unknown` and forwards it untouched (the backend re-validates).
 */
export function ActiveStepCard({
  projectId,
  readiness,
  disabled,
  onSubmit,
  onDismiss,
  reopenedCardKey,
  onAdjust,
  onCloseReopened,
  tokens,
}: {
  projectId: string
  readiness: Readiness | undefined
  disabled: boolean
  onSubmit: (cardKey: CardKey, payload: Record<string, unknown>) => void
  /** Skip affordance ("Agora não") — forwarded to the ACTIVE-STEP card so the
   *  dismiss button actually renders. Routes to a lightweight chat turn. NOT
   *  used while a reopened card is showing (reopen close is silent). */
  onDismiss: () => void
  /** FR-17 — card reopened from the summary's "Ajustar"; takes over the slot. */
  reopenedCardKey: CardKey | null
  /** FR-17 — handed to the summary card so each section can reopen its card. */
  onAdjust: (cardKey: CardKey) => void
  /** FR-17 — closes the reopened card WITHOUT sending any chat message. */
  onCloseReopened: () => void
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  const stepId = readiness?.step.id as StepId | undefined
  const stepDescriptor = stepId ? getCardForStep(stepId) : undefined
  const reopenDescriptor = reopenedCardKey
    ? getCardDescriptor(reopenedCardKey)
    : undefined
  const isReopen = reopenDescriptor !== undefined
  const descriptor = reopenDescriptor ?? stepDescriptor

  // Bind this card's onSubmit to its cardKey so the card can stay payload-only.
  const handleSubmit = React.useCallback(
    (payload: unknown) => {
      if (!descriptor) return
      onSubmit(
        descriptor.cardKey,
        (payload ?? {}) as Record<string, unknown>,
      )
    },
    [descriptor, onSubmit],
  )

  if (!descriptor) return null

  // Safe widening: extra optional prop, ignored by cards that don't declare it
  // (see AdjustableCardProps above).
  const CardComponent =
    descriptor.component as React.ComponentType<AdjustableCardProps>
  const value = resolveBuilderState(readiness)

  return (
    // ÚLTIMO item do fluxo da conversa, DENTRO do container de scroll das
    // mensagens (um único scroll — feedback do founder). Mesma coluna
    // max-w-2xl das bolhas; mt-5 espelha o gap-5 do fluxo. O card cresce
    // naturalmente (sem max-h/scroll próprio) e o auto-scroll re-ancora via
    // ResizeObserver do conteúdo em use-chat-stream.
    <div className="mx-auto mt-5 w-full max-w-2xl">
      {isReopen && (
        <div className="mb-1 flex items-center justify-between px-1">
          <span
            className="text-[11px] font-medium"
            style={{ color: tokens.textSecondary }}
          >
            Ajustando: {descriptor.title}
          </span>
          <button
            type="button"
            onClick={onCloseReopened}
            aria-label="Fechar ajuste"
            className="flex items-center gap-1 rounded text-[11px] font-medium transition-colors hover:underline"
            style={{ color: tokens.textSecondary }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Fechar
          </button>
        </div>
      )}
      <CardComponent
        projectId={projectId}
        cardKey={descriptor.cardKey}
        value={value}
        disabled={disabled}
        onSubmit={handleSubmit}
        // Reopened cards' own dismiss button ("Agora não") must close
        // SILENTLY — never the "pular passo" chat turn of the active step.
        onDismiss={isReopen ? onCloseReopened : onDismiss}
        onAdjust={onAdjust}
        onSubmitCard={onSubmit}
        tokens={tokens}
      />
    </div>
  )
}
