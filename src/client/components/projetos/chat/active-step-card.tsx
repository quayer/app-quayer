"use client"

/**
 * ActiveStepCard — the pinned slot that renders the card for the CURRENT
 * journey step, driven by the deterministic readiness snapshot. Structural
 * extraction from chat-panel.tsx (no behavior change).
 */

import * as React from "react"

import { useAppTokens } from "@/client/hooks/use-app-tokens"

import { getCardForStep } from "./cards/card-registry"
import { parseBuilderState } from "@/server/ai-module/builder/cards/builder-state"
import type { BuilderState } from "@/server/ai-module/builder/cards/builder-state"
import type { CardKey } from "./cards/types"
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
 * ActiveStepCard maps `readiness.step.id` (a StepId) onto a registered W3 card
 * via `getCardForStep` and renders it with the canonical BuilderState (`value`),
 * wiring its `onSubmit` to chat-panel's `submitCard(cardKey, payload)` (which
 * owns POST + SSE). Renders nothing when the step has no card (free-text steps
 * like `project_identity`/`objective`, or legacy steps still served inline by
 * ToolCallCard: tools/channel/agent_approval).
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
  tokens,
}: {
  projectId: string
  readiness: Readiness | undefined
  disabled: boolean
  onSubmit: (cardKey: CardKey, payload: Record<string, unknown>) => void
  /** Skip affordance ("Agora não"/"Ajustar") — forwarded to every card so the
   *  dismiss button actually renders. Routes to a lightweight chat turn. */
  onDismiss: () => void
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  const stepId = readiness?.step.id as StepId | undefined
  const descriptor = stepId ? getCardForStep(stepId) : undefined

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

  const CardComponent = descriptor.component
  const value = resolveBuilderState(readiness)

  return (
    <div className="px-4 pb-1 pt-2 md:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <CardComponent
          projectId={projectId}
          cardKey={descriptor.cardKey}
          value={value}
          disabled={disabled}
          onSubmit={handleSubmit}
          onDismiss={onDismiss}
          tokens={tokens}
        />
      </div>
    </div>
  )
}
