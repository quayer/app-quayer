"use client"

/**
 * Builder Cards — calendar_connect (Orayon Uplift, W3)
 *
 * Read-mostly connection card for cardKey `calendar_connect`. Backed by
 * `CalendarConnection`; shown only when `qualification.action === 'book_appointment'`.
 *
 * Behaviour:
 *   - Renders a connect button/link + the current connection status read from
 *     `value.calendar.status`.
 *   - The OAuth/connection flow itself is driven OUTSIDE the card (the deploy
 *     saga / chat-panel owns the real CalendarConnection + POST + SSE). This card
 *     is presentational: pressing "Conectar" fires `onSubmit` to kick off the
 *     connect turn; each ACK re-renders the card with a fresher `value.calendar`.
 *   - "Polls until CONNECTED then auto-confirms": cards never fetch, so the poll
 *     is expressed as a reaction to `value` — when `value.calendar.status`
 *     resolves to CONNECTED and the card has not yet been confirmed, the card
 *     fires `onSubmit({connectionId, status})` EXACTLY ONCE (guarded per
 *     connectionId) so chat-panel flips the `calendar` sentinel automatically.
 *
 * Presentational only: no fetching, token-driven styling via CardShell. Matches
 * the ChannelSelectionCard / ToolSelectionCard idiom (chat-panel.tsx).
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (card catalog).
 */

import * as React from "react"
import {
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CircleAlert,
  Loader2,
} from "lucide-react"

import { CardShell, type CardShellAction } from "./card-shell"
import type { CardComponentProps } from "./types"

/**
 * Exact submit payload for `calendar_connect` (CARD CONTRACT). The Wire phase
 * (chat-panel) injects the `cardKey` discriminator before POSTing; the card
 * emits only its owned slice.
 */
export interface CalendarConnectPayload {
  connectionId?: string
  status?: string
}

/** Normalized connection state derived from the free-form `calendar.status`. */
type CalendarPhase = "idle" | "connecting" | "connected" | "error"

/**
 * Map the opaque `value.calendar.status` (a free-form string written by the
 * deploy saga / OAuth callback) onto a small phase enum the UI can branch on.
 * Defensive: any unknown/empty value is treated as "idle" (not connected).
 */
function resolvePhase(status: string | undefined): CalendarPhase {
  const s = (status ?? "").trim().toLowerCase()
  if (s === "") return "idle"
  if (
    s === "connected" ||
    s === "active" ||
    s === "ok" ||
    s === "ready" ||
    s === "linked"
  ) {
    return "connected"
  }
  if (
    s === "connecting" ||
    s === "pending" ||
    s === "in_progress" ||
    s === "authorizing" ||
    s === "awaiting"
  ) {
    return "connecting"
  }
  if (s === "error" || s === "failed" || s === "expired" || s === "revoked") {
    return "error"
  }
  // Unknown but non-empty: assume the connection is still settling.
  return "connecting"
}

const PHASE_COPY: Record<
  CalendarPhase,
  { title: string; reason: string }
> = {
  idle: {
    title: "Conectar agenda",
    reason:
      "Conecte sua agenda para que o agente possa marcar horários direto na conversa.",
  },
  connecting: {
    title: "Conectando agenda…",
    reason:
      "Aguardando a confirmação da conexão. Conclua a autorização na aba que abriu — isto atualiza sozinho.",
  },
  connected: {
    title: "Agenda conectada",
    reason: "Tudo certo — o agente já pode agendar compromissos por aqui.",
  },
  error: {
    title: "Falha ao conectar a agenda",
    reason:
      "Não foi possível concluir a conexão. Tente conectar novamente para reautorizar o acesso.",
  },
}

function PhaseIcon({ phase }: { phase: CalendarPhase }) {
  switch (phase) {
    case "connected":
      return <CalendarCheck className="h-4 w-4" />
    case "connecting":
      return <CalendarClock className="h-4 w-4" />
    case "error":
      return <CircleAlert className="h-4 w-4" />
    default:
      return <CalendarPlus className="h-4 w-4" />
  }
}

/**
 * CalendarConnectCard — presentational card for `calendar_connect`.
 *
 * Props: {@link CardComponentProps}<{@link CalendarConnectPayload}>.
 * On confirm/connect it calls `onSubmit({ connectionId, status })`.
 */
export function CalendarConnectCard({
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<CalendarConnectPayload>) {
  const calendar = value.calendar
  const phase = resolvePhase(calendar.status)
  const alreadyConfirmed = value.confirmations.calendar
  const copy = PHASE_COPY[phase]

  // Guard so the auto-confirm fires at most once per resolved connectionId — a
  // re-render with the same CONNECTED state must NOT re-submit. We key on the
  // connectionId (falling back to a sentinel for connections that report
  // CONNECTED before an id lands) to survive re-mounts within the same value.
  const autoConfirmedRef = React.useRef<string | null>(null)

  // "Poll until CONNECTED then auto-confirm": cards don't fetch, so we react to
  // the canonical `value`. When the status resolves to CONNECTED and the
  // sentinel is not yet set, emit the payload exactly once.
  React.useEffect(() => {
    if (disabled) return
    if (phase !== "connected") return
    if (alreadyConfirmed) return

    const connKey = calendar.connectionId ?? "__connected__"
    if (autoConfirmedRef.current === connKey) return
    autoConfirmedRef.current = connKey

    onSubmit({
      connectionId: calendar.connectionId,
      status: calendar.status,
    })
  }, [
    disabled,
    phase,
    alreadyConfirmed,
    calendar.connectionId,
    calendar.status,
    onSubmit,
  ])

  const handleConnect = React.useCallback(() => {
    // Kick off (or retry) the connect/poll turn. The actual OAuth flow + status
    // updates are owned by chat-panel / the deploy saga; we just signal intent
    // and carry whatever connection data we already have.
    onSubmit({
      connectionId: calendar.connectionId,
      status: calendar.status,
    })
  }, [onSubmit, calendar.connectionId, calendar.status])

  const handleConfirm = React.useCallback(() => {
    onSubmit({
      connectionId: calendar.connectionId,
      status: calendar.status,
    })
  }, [onSubmit, calendar.connectionId, calendar.status])

  const actions: CardShellAction[] = []

  if (phase === "connected") {
    // Already auto-confirmed via the effect; only offer a manual confirm if the
    // sentinel somehow lags (defensive — keeps the user unblocked).
    if (!alreadyConfirmed) {
      actions.push({
        label: "Confirmar agenda",
        onClick: handleConfirm,
        variant: "primary",
        icon: <CalendarCheck className="h-3.5 w-3.5" />,
        disabled,
      })
    }
  } else if (phase === "connecting") {
    actions.push({
      label: "Conectando…",
      onClick: handleConnect,
      variant: "secondary",
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      disabled: true,
    })
  } else {
    actions.push({
      label: phase === "error" ? "Conectar novamente" : "Conectar agenda",
      onClick: handleConnect,
      variant: "primary",
      icon: <CalendarPlus className="h-3.5 w-3.5" />,
      disabled,
    })
  }

  // "Agora não" only while not connected — never let the user dismiss a fully
  // connected (and auto-confirmed) calendar out from under the flow.
  if (onDismiss && phase !== "connected") {
    actions.push({
      label: "Agora não",
      onClick: onDismiss,
      variant: "secondary",
      disabled,
    })
  }

  return (
    <CardShell
      icon={<PhaseIcon phase={phase} />}
      title={copy.title}
      reason={copy.reason}
      actions={actions}
      tokens={tokens}
    >
      <StatusRow phase={phase} connectionId={calendar.connectionId} tokens={tokens} />
    </CardShell>
  )
}

/** Inline status chip + optional connection id, mirroring the chip idiom. */
function StatusRow({
  phase,
  connectionId,
  tokens,
}: {
  phase: CalendarPhase
  connectionId: string | undefined
  tokens: CardComponentProps["tokens"]
}) {
  const chip = STATUS_CHIP[phase]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
        style={{
          backgroundColor: chip.bg(tokens),
          color: chip.fg(tokens),
        }}
      >
        {phase === "connecting" && (
          <Loader2 className="h-3 w-3 animate-spin" />
        )}
        {chip.label}
      </span>
      {connectionId && (
        <span
          className="truncate text-[11px]"
          style={{ color: tokens.textTertiary }}
          title={connectionId}
        >
          #{connectionId}
        </span>
      )}
    </div>
  )
}

const STATUS_CHIP: Record<
  CalendarPhase,
  {
    label: string
    bg: (t: CardComponentProps["tokens"]) => string
    fg: (t: CardComponentProps["tokens"]) => string
  }
> = {
  idle: {
    label: "Não conectada",
    bg: (t) => t.hoverBg,
    fg: (t) => t.textTertiary,
  },
  connecting: {
    label: "Conectando",
    bg: (t) => t.warningSubtle,
    fg: (t) => t.warningText,
  },
  connected: {
    label: "Conectada",
    bg: (t) => t.successSubtle,
    fg: (t) => t.successText,
  },
  error: {
    label: "Erro",
    bg: (t) => t.dangerSubtle,
    fg: (t) => t.dangerText,
  },
}

export default CalendarConnectCard
