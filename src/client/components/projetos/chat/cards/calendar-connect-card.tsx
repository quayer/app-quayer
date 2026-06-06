"use client"

/**
 * Builder Cards — calendar_connect (Orayon Uplift W3 + Onda C G10)
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
 * Onda C (G10) — duas adições:
 *   1. PROVA SOCIAL: depois que a fase resolve para `connected`, o card faz UMA
 *      leitura (ref-guarded por connectionId, igual ao autoConfirmedRef) de
 *      `GET /builder/calendar/events-preview/:projectId` e renderiza uma linha
 *      inline com a contagem de compromissos ("Identifiquei N compromisso(s)…").
 *      Cards normalmente NÃO fazem fetch — esta única leitura usa o mesmo `api`
 *      do chat-panel, é guardada e SOFT-FAILING (nunca rebaixa o status).
 *   2. ESCAPE HATCH: um contador local de tentativas incrementa a cada
 *      `handleConnect` que NÃO chega a `connected`. Após 2 tentativas sem
 *      sucesso (e fora de `connected`), aparece um botão secundário "Continuar
 *      sem agenda" que faz `onSubmit({ connectionId, status: 'skipped' })`. O
 *      backend (applyCalendarConnect) persiste `calendar.status='skipped'` e
 *      flipa `confirmations.calendar` — então nextPendingStep AVANÇA e o usuário
 *      nunca fica travado. A fase `skipped` é terminal/neutra (chip "Pulada") e
 *      ainda oferece "Conectar agenda" para reconectar depois.
 *
 * Presentational + 1 leitura guardada: token-driven styling via CardShell.
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (card catalog).
 */

import * as React from "react"
import {
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CircleAlert,
  Loader2,
} from "lucide-react"

import { api } from "@/igniter.client"

import { CardShell, type CardShellAction } from "./card-shell"
import type { CardComponentProps } from "./types"
import { type AgendaPreviewState, previewCopy } from "./calendar/events-preview"

/**
 * Exact submit payload for `calendar_connect` (CARD CONTRACT). The Wire phase
 * (chat-panel) injects the `cardKey` discriminator before POSTing; the card
 * emits only its owned slice.
 *
 * `status: 'skipped'` é o sinal do escape hatch — cabe em
 * `calendarConnectPayloadSchema.status` (string opcional, max 120), sem mudança
 * de schema.
 */
export interface CalendarConnectPayload {
  connectionId?: string
  status?: string
}

/** Normalized connection state derived from the free-form `calendar.status`. */
type CalendarPhase = "idle" | "connecting" | "connected" | "skipped" | "error"

/** Quantas tentativas de conexão sem sucesso antes de surgir o escape hatch. */
const SKIP_AFTER_FAILED_ATTEMPTS = 2

/**
 * Map the opaque `value.calendar.status` (a free-form string written by the
 * deploy saga / OAuth callback) onto a small phase enum the UI can branch on.
 * Defensive: any unknown/empty value is treated as "idle" (not connected).
 *
 * G10: `skipped`/`skip`/`none` resolvem para a fase terminal `skipped` (o
 * usuário optou por seguir sem agenda) — neutra, não-erro, reconectável.
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
  if (s === "skipped" || s === "skip" || s === "none") {
    return "skipped"
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
  skipped: {
    title: "Seguindo sem agenda",
    reason:
      "Sem problema — o agente vai qualificar o lead e te avisar quando alguém quiser marcar, sem prometer o agendamento. Você pode conectar a agenda quando quiser.",
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
    case "skipped":
      return <CalendarX className="h-4 w-4" />
    case "error":
      return <CircleAlert className="h-4 w-4" />
    default:
      return <CalendarPlus className="h-4 w-4" />
  }
}

/**
 * Minimal structural view of the auto-generated events-preview query hook.
 * Built on the EXISTING freeBusy infra (G10) and registered into the builder
 * controller by the Integrate phase; until the client regenerates, the action
 * may be absent — so we resolve it defensively ({@link resolveEventsPreviewQuery})
 * and degrade to a stable no-op hook instead of crashing at module-eval.
 *
 * The server returns `{ success, ... , available, busyCount }` (see
 * calendar-events-preview.routes.ts). We read `available`/`busyCount` off the
 * envelope's data slice.
 */
interface EventsPreviewEnvelope {
  available?: boolean
  busyCount?: number
}

interface EventsPreviewQuery {
  useQuery: (opts: {
    params: { projectId: string }
    enabled?: boolean
  }) => {
    data:
      | {
          success?: boolean
          data?: EventsPreviewEnvelope
        }
      | EventsPreviewEnvelope
      | undefined
    isLoading?: boolean
    isError?: boolean
    error?: unknown
  }
}

/**
 * Resolve the events-preview query hook off the typed client with a defensive
 * guard, ONCE at module-eval. Mirrors chat-panel's READINESS_QUERY resolver: if
 * the action is missing (client not regenerated yet) we fall back to a stable
 * no-op hook so the card renders WITHOUT the prova-social row instead of throwing.
 * Resolving once keeps the hook IDENTITY stable across renders (Rules of Hooks).
 */
const EVENTS_PREVIEW_QUERY: EventsPreviewQuery = (() => {
  // A action é composta NO builderController, então o client a expõe sob
  // `api.builder.eventsPreview` (o Igniter agrupa por NOME do controller), não
  // sob um namespace `calendar` (que não existe).
  const builderApi = (api as { builder?: { eventsPreview?: unknown } })
    .builder
  const candidate = builderApi?.eventsPreview
  if (
    candidate &&
    typeof (candidate as { useQuery?: unknown }).useQuery === "function"
  ) {
    return candidate as EventsPreviewQuery
  }
  return {
    useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  }
})()

/** Unwrap the events-preview envelope ({ success, data } OR raw) defensively. */
function readEventsPreview(
  raw: ReturnType<EventsPreviewQuery["useQuery"]>["data"],
): EventsPreviewEnvelope | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const inner = (raw as { data?: EventsPreviewEnvelope }).data
  if (inner && typeof inner === "object") return inner
  return raw as EventsPreviewEnvelope
}

/**
 * CalendarConnectCard — presentational card for `calendar_connect`.
 *
 * Props: {@link CardComponentProps}<{@link CalendarConnectPayload}>.
 * On confirm/connect it calls `onSubmit({ connectionId, status })`. On escape it
 * calls `onSubmit({ connectionId, status: 'skipped' })`.
 */
export function CalendarConnectCard({
  projectId,
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

  // G10 escape hatch — local counter of connect attempts that did NOT reach
  // `connected`. Increments on each handleConnect; resets to 0 once the phase
  // resolves to `connected`. Mirrors Orayon's failureCount/skipPersistentAfterFailures.
  const [failedAttempts, setFailedAttempts] = React.useState(0)
  React.useEffect(() => {
    // A successful connection clears the attempt counter — no escape needed.
    if (phase === "connected" && failedAttempts !== 0) {
      setFailedAttempts(0)
    }
  }, [phase, failedAttempts])

  const showSkipHatch =
    phase !== "connected" &&
    phase !== "skipped" &&
    failedAttempts >= SKIP_AFTER_FAILED_ATTEMPTS

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
    // and carry whatever connection data we already have. G10: count this as an
    // attempt — if it doesn't land on `connected`, the escape hatch surfaces.
    setFailedAttempts((n) => n + 1)
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

  // G10 escape hatch: opt out of the calendar. Persists status='skipped' and
  // flips confirmations.calendar via applyCalendarConnect — nextPendingStep
  // advances past `calendar`, so the user is NEVER trapped.
  const handleSkip = React.useCallback(() => {
    onSubmit({
      connectionId: calendar.connectionId,
      status: "skipped",
    })
  }, [onSubmit, calendar.connectionId])

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
    // idle / error / skipped — always offer to connect (skipped is re-connectable).
    actions.push({
      label: phase === "error" ? "Conectar novamente" : "Conectar agenda",
      onClick: handleConnect,
      variant: "primary",
      icon: <CalendarPlus className="h-3.5 w-3.5" />,
      disabled,
    })
  }

  // G10 escape hatch button — only after N failed attempts, and never once
  // connected/skipped. Lets a user stuck behind the OAuth gate move on.
  if (showSkipHatch) {
    actions.push({
      label: "Continuar sem agenda",
      onClick: handleSkip,
      variant: "secondary",
      icon: <CalendarX className="h-3.5 w-3.5" />,
      disabled,
    })
  }

  // "Agora não" only while not connected/skipped — never let the user dismiss a
  // fully connected (and auto-confirmed) calendar out from under the flow.
  if (onDismiss && phase !== "connected" && phase !== "skipped") {
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
      {phase === "connected" && (
        <AgendaPreviewBlock
          projectId={projectId}
          connectionId={calendar.connectionId}
          disabled={disabled}
          tokens={tokens}
        />
      )}
    </CardShell>
  )
}

/**
 * AgendaPreviewBlock — G10 prova social. Fires the single guarded events-preview
 * read once the calendar is connected and renders the inline AgendaPreviewRow.
 *
 * The read is ref-guarded per connectionId (exactly like autoConfirmedRef) so a
 * re-render with the same connected state does NOT re-issue the request; it is
 * SOFT-FAILING — an error renders a gentle hint and never flips the status.
 */
function AgendaPreviewBlock({
  projectId,
  connectionId,
  disabled,
  tokens,
}: {
  projectId: string
  connectionId: string | undefined
  disabled: boolean
  tokens: CardComponentProps["tokens"]
}) {
  // Ref-guard: only enable the query once per resolved connectionId. The hook is
  // always called (Rules of Hooks) but stays disabled until armed, then disables
  // itself again so the read happens exactly once per connection.
  const probedRef = React.useRef<string | null>(null)
  const connKey = connectionId ?? "__connected__"
  const [armedKey, setArmedKey] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (disabled) return
    if (probedRef.current === connKey) return
    probedRef.current = connKey
    setArmedKey(connKey)
  }, [disabled, connKey])

  const query = EVENTS_PREVIEW_QUERY.useQuery({
    params: { projectId },
    enabled: armedKey === connKey,
  })

  const state = React.useMemo<AgendaPreviewState>(() => {
    if (armedKey !== connKey) return "idle"
    if (query.isError) return "error"
    if (query.isLoading) return "loading"
    const preview = readEventsPreview(query.data)
    if (!preview) return "loading"
    // Soft-fail honesty: when the route degraded (available:false) we mirror the
    // gentle "couldn't read" hint rather than asserting an empty agenda.
    if (preview.available === false) return "error"
    const busyCount =
      typeof preview.busyCount === "number" ? preview.busyCount : 0
    return { kind: "ready", busyCount }
  }, [armedKey, connKey, query.isError, query.isLoading, query.data])

  const body = previewCopy(state)
  if (body === "") return null

  const isLoading = state === "loading"

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-[12px] leading-relaxed"
      style={{
        backgroundColor: tokens.bgBase,
        borderColor: tokens.divider,
        color: tokens.textSecondary,
      }}
    >
      {isLoading ? (
        <Loader2
          className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin"
          style={{ color: tokens.textTertiary }}
          aria-hidden="true"
        />
      ) : (
        <CalendarCheck
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
          style={{ color: tokens.brand }}
          aria-hidden="true"
        />
      )}
      <span>{body}</span>
    </div>
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
      {/* Skipped/connected hide the raw connection id — for skipped it is noise. */}
      {connectionId && phase !== "skipped" && (
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
  skipped: {
    label: "Pulada",
    bg: (t) => t.hoverBg,
    fg: (t) => t.textTertiary,
  },
  error: {
    label: "Erro",
    bg: (t) => t.dangerSubtle,
    fg: (t) => t.dangerText,
  },
}

export default CalendarConnectCard
