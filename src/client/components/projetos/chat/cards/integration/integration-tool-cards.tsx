"use client"

/**
 * Integration Builder — chat dispatcher pieces (Wave 2, T41)
 *
 * Mode-4 INLINE rendering for the two integration tool calls, delegated to here
 * from `ToolCallCard` (~2 lines per branch) so the dispatcher stays ≤300 lines
 * and CARD_REGISTRY stays untouched (integration is NOT a preview_summary section;
 * reopen is via the integrations panel — see plan §4 / T41).
 *
 * WIRING — how each card reaches the screen (mode 4, no CARD_REGISTRY):
 *  - `propose_integration` tool result carries `card: 'integration_proposal'` and
 *    writes `builderState.integration.proposed` (server-side). We render
 *    {@link IntegrationProposalCard} from that state slice.
 *  - CREDENTIALS FOLLOW-UP: there is no separate tool that returns the
 *    `integration_credentials` card key — the proposal confirm handler
 *    (`apply-integration-cards.ts`) creates the draft and asks the chat to show
 *    the credentials card. The cleanest path consistent with the mode-4 pipeline
 *    is an INLINE TRANSITION: once the user confirms the proposal, this wrapper
 *    swaps the proposal card for {@link IntegrationCredentialsCard} in the SAME
 *    slot (local `confirmed` flag). The credentials submit still flows UP through
 *    chat-panel's `onSubmitCard` (POST + SSE), exactly like every other card.
 *  - `test_integration` tool result `{ outcome, diagnosis }` renders as a compact
 *    inline result via {@link IntegrationTestResultCard}.
 *
 * CREDENTIAL FIELDS sourcing (T40 contract): BuilderState carries the platform but
 * NOT the credentialFields metadata. We source them from the draft integration via
 * the `useIntegrations(projectId)` hook, matched by the proposal's `templateSlug`
 * (fallback: by displayName). When absent, the credentials card degrades gracefully
 * to its "open the panel" note (it renders that itself).
 *
 * Bridge: `ToolCallCard` exposes `onSubmitCard(cardKey, payload)`; the card
 * contract is `onSubmit(payload)`. We adapt by binding the cardKey here. Zero `any`.
 */

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { useIntegrations } from "@/client/components/projetos/preview/tabs/advanced/use-integrations"

import type { BuilderState, CardKey } from "../types"
import {
  IntegrationProposalCard,
  type IntegrationProposalPayload,
} from "./integration-proposal-card"
import {
  IntegrationCredentialsCard,
  type IntegrationCredentialField,
  type IntegrationCredentialsPayload,
} from "./integration-credentials-card"
import { CardShell } from "../card-shell"
import { CheckCircle2, Link2 } from "lucide-react"

/** Shared props the dispatcher hands every integration tool card. */
interface IntegrationToolCardBaseProps {
  projectId: string
  value: BuilderState
  disabled: boolean
  tokens: AppTokens
  /** chat-panel's card-action submit (POST + SSE) — bound to a cardKey below. */
  onSubmitCard: (cardKey: CardKey, payload: Record<string, unknown>) => void
}

/**
 * renderIntegrationToolCard — the single dispatch the ToolCallCard delegates to
 * (~3 lines there). Returns the matching inline card for the two integration tool
 * calls, or `null` for everything else (so the dispatcher falls through to its
 * other branches / the status chip). Mode-4 only — never touches CARD_REGISTRY.
 */
export function renderIntegrationToolCard(args: {
  toolName: string
  result: unknown
  projectId: string
  value: BuilderState
  disabled: boolean
  tokens: AppTokens
  onSubmitCard: (cardKey: CardKey, payload: Record<string, unknown>) => void
}): React.JSX.Element | null {
  const { toolName, result, projectId, value, disabled, tokens, onSubmitCard } =
    args

  if (toolName === "propose_integration") {
    return (
      <IntegrationProposalToolCard
        projectId={projectId}
        value={value}
        disabled={disabled}
        tokens={tokens}
        onSubmitCard={onSubmitCard}
      />
    )
  }

  if (toolName === "test_integration") {
    const outcome = getIntegrationTestOutcome(result)
    return outcome ? (
      <IntegrationTestResultCard result={outcome} tokens={tokens} />
    ) : null
  }

  return null
}

/**
 * IntegrationProposalToolCard — the `propose_integration` branch. Renders the
 * proposal card from `value.integration.proposed`; on confirm it submits the
 * confirm payload UP (server creates the draft) AND transitions INLINE to the
 * credentials card in the same slot.
 */
export function IntegrationProposalToolCard({
  projectId,
  value,
  disabled,
  tokens,
  onSubmitCard,
}: IntegrationToolCardBaseProps): React.JSX.Element | null {
  // Local-only step flag: once the user confirms, swap to the credentials card.
  // The authoritative state still lives server-side (proposed → draftIntegrationId);
  // this only sequences the two inline cards within a single tool-call render.
  const [confirmed, setConfirmed] = React.useState(false)

  // Resolve the draft's credential fields up-front (hooks must run every render);
  // they are only consumed in the credentials step.
  const fields = useDraftCredentialFields(projectId, value)

  const handleProposalSubmit = React.useCallback(
    (payload: IntegrationProposalPayload) => {
      onSubmitCard(payload.cardKey, { ...payload })
      setConfirmed(true)
    },
    [onSubmitCard],
  )

  const handleCredentialsSubmit = React.useCallback(
    (payload: IntegrationCredentialsPayload) => {
      onSubmitCard("integration_credentials", { ...payload })
    },
    [onSubmitCard],
  )

  if (!confirmed) {
    return (
      <IntegrationProposalCard
        projectId={projectId}
        cardKey="integration_proposal"
        value={value}
        disabled={disabled}
        onSubmit={handleProposalSubmit}
        tokens={tokens}
      />
    )
  }

  return (
    <IntegrationCredentialsCard
      projectId={projectId}
      cardKey="integration_credentials"
      value={value}
      disabled={disabled}
      onSubmit={handleCredentialsSubmit}
      tokens={tokens}
      fields={fields}
    />
  )
}

/**
 * Resolve the draft integration's credentialFields for the credentials card. The
 * proposal slice (W2) carries `templateSlug`/`platform` but NOT the field metadata,
 * so we read the live project integrations and match the draft by templateSlug
 * (preferred) or by displayName. Returns `undefined` when nothing matches yet — the
 * credentials card then shows its graceful "open the panel" note.
 */
function useDraftCredentialFields(
  projectId: string,
  value: BuilderState,
): IntegrationCredentialField[] | undefined {
  const { integrations } = useIntegrations(projectId)
  const proposed = value.integration?.proposed

  return React.useMemo<IntegrationCredentialField[] | undefined>(() => {
    if (!proposed) return undefined
    const slug = proposed.templateSlug
    const platform = proposed.platform?.trim().toLowerCase()
    const match =
      (slug ? integrations.find((i) => i.templateSlug === slug) : undefined) ??
      (platform
        ? integrations.find((i) => i.displayName.trim().toLowerCase() === platform)
        : undefined)
    if (!match || match.credentialFields.length === 0) return undefined
    // Map the list view-model (placeholder: string | null, has `filled`) onto the
    // card's field shape (placeholder?: string). Never carries any value.
    return match.credentialFields.map((f) => ({
      key: f.key,
      label: f.label,
      whereToGet: f.whereToGet,
      placeholder: f.placeholder ?? undefined,
    }))
  }, [integrations, proposed])
}

/** The `test_integration` tool result shape (mirror of the tool's return). */
export interface IntegrationTestOutcome {
  outcome: string
  diagnosis: string
}

/** Coerce an unknown tool result into the value-free `{ outcome, diagnosis }`. */
export function getIntegrationTestOutcome(
  result: unknown,
): IntegrationTestOutcome | null {
  if (!result || typeof result !== "object") return null
  const r = result as Record<string, unknown>
  if (typeof r.outcome !== "string" || typeof r.diagnosis !== "string") {
    return null
  }
  return { outcome: r.outcome, diagnosis: r.diagnosis }
}

/**
 * IntegrationTestResultCard — compact inline narration of the `test_integration`
 * tool result. Success = green check + "validada"; otherwise the leiga, value-free
 * `diagnosis`. Never any credential value (the tool never returns one).
 */
export function IntegrationTestResultCard({
  result,
  tokens,
}: {
  result: IntegrationTestOutcome
  tokens: AppTokens
}): React.JSX.Element {
  const ok = result.outcome === "success"
  return (
    <CardShell
      tokens={tokens}
      icon={
        ok ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Link2 className="h-4 w-4" />
        )
      }
      title={ok ? "Conexão validada" : "Teste de conexão"}
      reason={
        ok
          ? "A integração foi testada com sucesso e está pronta para ser ativada."
          : result.diagnosis
      }
    />
  )
}
