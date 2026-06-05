"use client"

/**
 * Builder Cards — source_progress (Orayon Uplift, W4 source-ingestion)
 *
 * cardKey `source_progress`. The "cole seu site/IG" ingestion card, backed by
 * `KnowledgeSource` (status per URL) + `builderState.sourceIngestion`.
 *
 * Two zones:
 *   1. Sources list  — one row per `value.sourceIngestion.sources[]` with a
 *      status pill: pendente → processando → pronto | erro. The enrich pipeline
 *      runs on an ASYNC BullMQ job (`quayer:source-enrich`), so the card POLLS
 *      `GET /api/v1/builder/projects/:id/sources/status` (~2s) until every source
 *      settles to ready|error — cards are otherwise presentational, but this poll
 *      is the one async affordance the brief grants (status is owned by a sibling
 *      route, not the SSE turn).
 *   2. "Campos detectados" — the PROPOSED synthesis from
 *      `value.sourceIngestion.proposed` (businessName / services / audience /
 *      differentiators / tone). These are anti-hallucination PROPOSALS: they only
 *      commit to the owned BuilderState fields + flip `confirmations.source` when
 *      the user clicks "Aceitar" (which calls `onSubmit({ accept:true, edited? })`
 *      per the SOURCE_PROGRESS CARD CONTRACT). "Editar" lets the user tweak the
 *      proposal before accepting.
 *
 * The card reads the CANONICAL `props.value` for the seed proposal/sources, and
 * MERGES live status from the poll (so freshly-settled sources update without an
 * SSE round-trip). It NEVER mutates owned fields itself — that's the backend's
 * job once "Aceitar" lands. "Aceitar" is disabled until `proposed` is populated.
 *
 * Styling idiom matches the other W3 cards via CardShell + useAppTokens tokens
 * (passed down as `props.tokens`).
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md §5 (source-ingestion).
 */

import * as React from "react"
import {
  Check,
  CircleAlert,
  CircleCheck,
  Clock,
  Globe,
  Instagram,
  Loader2,
  Pencil,
  Sparkles,
  X,
} from "lucide-react"

import { Input } from "@/client/components/ui/input"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type {
  SourceIngestionItem,
  SourceProposal,
} from "@/server/ai-module/builder/cards/builder-state"

import { CardShell, type CardShellAction } from "./card-shell"
import type { CardComponentProps } from "./types"

/**
 * Exact submit payload for `source_progress` (SOURCE_PROGRESS CARD CONTRACT).
 * On "Aceitar" the card emits `{ accept: true, edited? }`; the backend copies the
 * PROPOSED values (overridden by `edited`) into the owned BuilderState fields and
 * flips `confirmations.source`. `edited` carries only the fields the user touched.
 */
export interface SourceProgressPayload {
  accept: true
  edited?: {
    businessName?: string
    services?: string[]
    audience?: string
    differentiators?: string[]
    tone?: string
  }
}

/** Poll cadence for the sources-status endpoint (ms). */
const POLL_INTERVAL_MS = 2000

/** Soft cap per editable list, matching the services card idiom. */
const MAX_ITEMS = 30

// ──────────────────────────────────────────────────────────────────────────
// Status phase
// ──────────────────────────────────────────────────────────────────────────

/** Normalized status the pill branches on. */
type SourcePhase = "pending" | "processing" | "ready" | "error"

/**
 * Map the free-form `status` string (canonical writers emit
 * pending|processing|ready|error) onto the pill phase. Defensive: any unknown /
 * empty value is treated as "pending" (still settling, never blocks accept).
 */
function resolvePhase(status: string | undefined): SourcePhase {
  const s = (status ?? "").trim().toLowerCase()
  if (s === "ready" || s === "done" || s === "ok" || s === "completed") {
    return "ready"
  }
  if (s === "error" || s === "failed" || s === "errored") {
    return "error"
  }
  if (
    s === "processing" ||
    s === "running" ||
    s === "ingesting" ||
    s === "in_progress"
  ) {
    return "processing"
  }
  return "pending"
}

/** A source has SETTLED once it is ready or error (poll stop condition). */
function isSettled(phase: SourcePhase): boolean {
  return phase === "ready" || phase === "error"
}

const PHASE_PILL: Record<
  SourcePhase,
  {
    label: string
    bg: (t: AppTokens) => string
    fg: (t: AppTokens) => string
    icon: React.ReactNode
  }
> = {
  pending: {
    label: "Pendente",
    bg: (t) => t.hoverBg,
    fg: (t) => t.textTertiary,
    icon: <Clock className="h-3 w-3" />,
  },
  processing: {
    label: "Processando",
    bg: (t) => t.warningSubtle,
    fg: (t) => t.warningText,
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  ready: {
    label: "Pronto",
    bg: (t) => t.successSubtle,
    fg: (t) => t.successText,
    icon: <CircleCheck className="h-3 w-3" />,
  },
  error: {
    label: "Erro",
    bg: (t) => t.dangerSubtle,
    fg: (t) => t.dangerText,
    icon: <CircleAlert className="h-3 w-3" />,
  },
}

// ──────────────────────────────────────────────────────────────────────────
// Status polling hook
// ──────────────────────────────────────────────────────────────────────────

/**
 * Structural shape of one source row returned by the status endpoint. Kept
 * permissive (mirrors `SourceIngestionItem`) so a slightly-richer payload from
 * the route doesn't break parsing; we read only `value`/`type`/`status`/`sourceId`.
 */
interface StatusEndpointSource {
  value: string
  type: "url" | "instagram"
  status: string
  sourceId?: string
}

/** Status endpoint envelope: `{ sources: [...] }` (and optionally a proposal). */
interface StatusEndpointResponse {
  sources?: StatusEndpointSource[]
  proposed?: SourceProposal
}

/** Type-guard: is `v` a non-null record we can index. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Coerce an unknown JSON body into `StatusEndpointSource[]` (never throws). */
function parseStatusSources(body: unknown): StatusEndpointSource[] {
  if (!isRecord(body)) return []
  const raw = body.sources
  if (!Array.isArray(raw)) return []
  const out: StatusEndpointSource[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const value = entry.value
    const type = entry.type
    const status = entry.status
    if (typeof value !== "string") continue
    if (type !== "url" && type !== "instagram") continue
    out.push({
      value,
      type,
      status: typeof status === "string" ? status : "pending",
      sourceId: typeof entry.sourceId === "string" ? entry.sourceId : undefined,
    })
  }
  return out
}

/** Extract the (optional) proposal from a status response (never throws). */
function parseStatusProposed(body: unknown): SourceProposal | undefined {
  if (!isRecord(body)) return undefined
  const p = body.proposed
  if (!isRecord(p)) return undefined
  const businessName = typeof p.businessName === "string" ? p.businessName : undefined
  const audience = typeof p.audience === "string" ? p.audience : undefined
  const tone = typeof p.tone === "string" ? p.tone : undefined
  const services = Array.isArray(p.services)
    ? p.services.filter((s): s is string => typeof s === "string")
    : undefined
  const differentiators = Array.isArray(p.differentiators)
    ? p.differentiators.filter((s): s is string => typeof s === "string")
    : undefined
  const proposal: SourceProposal = {}
  if (businessName) proposal.businessName = businessName
  if (services && services.length > 0) proposal.services = services
  if (audience) proposal.audience = audience
  if (differentiators && differentiators.length > 0) {
    proposal.differentiators = differentiators
  }
  if (tone) proposal.tone = tone
  return Object.keys(proposal).length > 0 ? proposal : undefined
}

interface PollResult {
  /** Live sources merged from the poll (falls back to seed when not polled yet). */
  sources: SourceIngestionItem[]
  /** Live proposal from the poll, when the endpoint includes it. */
  proposed: SourceProposal | undefined
}

/**
 * Poll `GET /api/v1/builder/projects/:id/sources/status` every ~2s until every
 * source has settled (ready|error) or the component unmounts. Same-origin fetch
 * with cookie auth (the middleware excludes /api), mirroring chat-panel's fetch
 * idiom. Seeds from `props.value` so the list renders instantly before the first
 * poll lands; a failed poll is swallowed (it just retries on the next tick).
 */
function useSourceStatusPoll(
  projectId: string,
  seedSources: SourceIngestionItem[],
  seedProposed: SourceProposal | undefined,
): PollResult {
  const [polled, setPolled] = React.useState<PollResult | null>(null)

  // Whether all KNOWN sources have settled — derived from the freshest data
  // (polled if present, else the seed). Drives whether the interval keeps going.
  const liveSources = polled?.sources ?? seedSources
  const allSettled =
    liveSources.length > 0 &&
    liveSources.every((s) => isSettled(resolvePhase(s.status)))

  React.useEffect(() => {
    // Nothing to track, or everything already settled: no poll loop.
    if (seedSources.length === 0) return
    if (allSettled) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/v1/builder/projects/${projectId}/sources/status`,
          { method: "GET", headers: { Accept: "application/json" } },
        )
        if (cancelled) return
        if (res.ok) {
          const body: unknown = await res.json()
          if (cancelled) return
          const sources = parseStatusSources(body)
          const proposed = parseStatusProposed(body)
          if (sources.length > 0 || proposed) {
            setPolled({
              sources: sources.length > 0 ? sources : liveSources,
              proposed: proposed ?? polled?.proposed,
            })
          }
          // Stop the loop once the freshest poll shows everything settled.
          const settled =
            sources.length > 0 &&
            sources.every((s) => isSettled(resolvePhase(s.status)))
          if (settled) return
        }
      } catch {
        // Swallow — network blips just retry on the next scheduled tick.
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS)
    }

    timer = setTimeout(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // `allSettled` gates the loop; `liveSources`/`polled` are read inside but we
    // intentionally re-arm only on identity of the gate + projectId to avoid a
    // tight re-subscribe churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, allSettled, seedSources.length])

  return {
    sources: polled?.sources ?? seedSources,
    proposed: polled?.proposed ?? seedProposed,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Editable list (chips), reused for services + differentiators in edit mode
// ──────────────────────────────────────────────────────────────────────────

function addItem(list: string[], raw: string): string[] {
  const value = raw.trim()
  if (value.length === 0) return list
  if (list.length >= MAX_ITEMS) return list
  const exists = list.some((item) => item.toLowerCase() === value.toLowerCase())
  if (exists) return list
  return [...list, value]
}

function ChipList({
  heading,
  placeholder,
  items,
  onAdd,
  onRemove,
  tokens,
  disabled,
}: {
  heading: string
  placeholder: string
  items: string[]
  onAdd: (value: string) => void
  onRemove: (index: number) => void
  tokens: AppTokens
  disabled: boolean
}) {
  const [draft, setDraft] = React.useState("")

  const commitDraft = React.useCallback(() => {
    if (draft.trim().length === 0) return
    onAdd(draft)
    setDraft("")
  }, [draft, onAdd])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault()
        commitDraft()
      }
    },
    [commitDraft],
  )

  const atCap = items.length >= MAX_ITEMS

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span
          className="text-[12px] font-medium"
          style={{ color: tokens.textPrimary }}
        >
          {heading}
        </span>
        <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
          {items.length}/{MAX_ITEMS}
        </span>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px]"
              style={{
                backgroundColor: tokens.brandSubtle,
                borderColor: tokens.brandBorder,
                color: tokens.brandText,
              }}
            >
              <span className="max-w-[180px] truncate">{item}</span>
              <button
                type="button"
                aria-label={`Remover ${item}`}
                disabled={disabled}
                onClick={() => onRemove(index)}
                className="-mr-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={atCap ? "Limite atingido" : placeholder}
          disabled={disabled || atCap}
          className="h-8 text-[12px]"
          aria-label={heading}
        />
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Source row
// ──────────────────────────────────────────────────────────────────────────

function SourceRow({
  source,
  tokens,
}: {
  source: SourceIngestionItem
  tokens: AppTokens
}) {
  const phase = resolvePhase(source.status)
  const pill = PHASE_PILL[phase]
  const TypeIcon = source.type === "instagram" ? Instagram : Globe

  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2"
      style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <TypeIcon
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: tokens.textTertiary }}
        />
        <span
          className="truncate text-[12px]"
          style={{ color: tokens.textPrimary }}
          title={source.value}
        >
          {source.value}
        </span>
      </div>
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
        style={{ backgroundColor: pill.bg(tokens), color: pill.fg(tokens) }}
      >
        {pill.icon}
        {pill.label}
      </span>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Detected fields (read view + edit view)
// ──────────────────────────────────────────────────────────────────────────

function FieldRow({
  label,
  children,
  tokens,
}: {
  label: string
  children: React.ReactNode
  tokens: AppTokens
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[11px] font-medium uppercase tracking-wide"
        style={{ color: tokens.textTertiary }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function ReadChips({ items, tokens }: { items: string[]; tokens: AppTokens }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className="inline-flex items-center rounded-full border px-2.5 py-1 text-[12px]"
          style={{
            backgroundColor: tokens.brandSubtle,
            borderColor: tokens.brandBorder,
            color: tokens.brandText,
          }}
        >
          <span className="max-w-[200px] truncate">{item}</span>
        </span>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// SourceProgressCard
// ──────────────────────────────────────────────────────────────────────────

/**
 * SourceProgressCard — cardKey `source_progress`. Lists ingested sources with a
 * live status pill (polled), shows the PROPOSED detected fields, and on "Aceitar"
 * fires `onSubmit({ accept: true, edited? })` per the SOURCE_PROGRESS CARD
 * CONTRACT. "Aceitar" stays disabled until a proposal is populated.
 */
export function SourceProgressCard({
  projectId,
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<SourceProgressPayload>) {
  const seedSources = value.sourceIngestion.sources
  const seedProposed = value.sourceIngestion.proposed
  const alreadyConfirmed = value.confirmations.source

  // Live poll: merges fresh per-source status (and a fresher proposal, if the
  // endpoint returns one) over the canonical seed.
  const { sources, proposed } = useSourceStatusPoll(
    projectId,
    seedSources,
    seedProposed,
  )

  const hasProposal =
    proposed != null &&
    Boolean(
      proposed.businessName ||
        (proposed.services && proposed.services.length > 0) ||
        proposed.audience ||
        (proposed.differentiators && proposed.differentiators.length > 0) ||
        proposed.tone,
    )

  // ── Edit mode + draft (seeded from the proposal) ────────────────────────
  const [editing, setEditing] = React.useState(false)
  const [businessName, setBusinessName] = React.useState("")
  const [services, setServices] = React.useState<string[]>([])
  const [audience, setAudience] = React.useState("")
  const [differentiators, setDifferentiators] = React.useState<string[]>([])
  const [tone, setTone] = React.useState("")

  const enterEdit = React.useCallback(() => {
    // Seed the draft from the freshest proposal at the moment "Editar" is pressed.
    setBusinessName(proposed?.businessName ?? "")
    setServices(proposed?.services ?? [])
    setAudience(proposed?.audience ?? "")
    setDifferentiators(proposed?.differentiators ?? [])
    setTone(proposed?.tone ?? "")
    setEditing(true)
  }, [proposed])

  const addService = React.useCallback((raw: string) => {
    setServices((cur) => addItem(cur, raw))
  }, [])
  const removeService = React.useCallback((index: number) => {
    setServices((cur) => cur.filter((_, i) => i !== index))
  }, [])
  const addDifferentiator = React.useCallback((raw: string) => {
    setDifferentiators((cur) => addItem(cur, raw))
  }, [])
  const removeDifferentiator = React.useCallback((index: number) => {
    setDifferentiators((cur) => cur.filter((_, i) => i !== index))
  }, [])

  // ── Accept ──────────────────────────────────────────────────────────────
  const handleAccept = React.useCallback(() => {
    if (!editing) {
      // Accept the proposal as-is — no `edited` overrides.
      onSubmit({ accept: true })
      return
    }
    // Build `edited` with only fields that diverge from / refine the proposal.
    const edited: NonNullable<SourceProgressPayload["edited"]> = {}
    const trimmedName = businessName.trim()
    const trimmedAudience = audience.trim()
    const trimmedTone = tone.trim()
    if (trimmedName) edited.businessName = trimmedName
    if (services.length > 0) edited.services = services
    if (trimmedAudience) edited.audience = trimmedAudience
    if (differentiators.length > 0) edited.differentiators = differentiators
    if (trimmedTone) edited.tone = trimmedTone
    onSubmit(
      Object.keys(edited).length > 0 ? { accept: true, edited } : { accept: true },
    )
  }, [
    editing,
    businessName,
    services,
    audience,
    differentiators,
    tone,
    onSubmit,
  ])

  // ── Footer actions ──────────────────────────────────────────────────────
  const actions: CardShellAction[] = []
  if (!alreadyConfirmed) {
    actions.push({
      label: "Aceitar",
      onClick: handleAccept,
      variant: "primary",
      icon: <Check className="h-3.5 w-3.5" />,
      // Disabled while streaming OR until the synthesis has produced a proposal.
      disabled: disabled || !hasProposal,
    })
    if (hasProposal && !editing) {
      actions.push({
        label: "Editar",
        onClick: enterEdit,
        variant: "secondary",
        icon: <Pencil className="h-3.5 w-3.5" />,
        disabled,
      })
    }
    if (editing) {
      actions.push({
        label: "Cancelar edição",
        onClick: () => setEditing(false),
        variant: "secondary",
        disabled,
      })
    }
    if (onDismiss && !editing) {
      actions.push({
        label: "Agora não",
        onClick: onDismiss,
        variant: "secondary",
        disabled,
      })
    }
  }

  const reason = alreadyConfirmed
    ? "Fontes processadas — os campos detectados já foram aplicados ao agente."
    : hasProposal
      ? "Revise os campos detectados a partir do seu site/Instagram. Edite se precisar e clique em Aceitar para aplicar ao agente."
      : "Estamos lendo seu site/Instagram e extraindo os campos do negócio. Isto atualiza sozinho — aguarde concluir."

  return (
    <CardShell
      icon={<Sparkles className="h-4 w-4" />}
      title="Fontes do negócio"
      reason={reason}
      actions={actions}
      tokens={tokens}
    >
      <div className="flex flex-col gap-4">
        {/* ── Sources list ── */}
        {sources.length > 0 && (
          <div className="flex flex-col gap-2">
            <span
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: tokens.textTertiary }}
            >
              Fontes
            </span>
            <div className="flex flex-col gap-1.5">
              {sources.map((source, index) => (
                <SourceRow
                  key={source.sourceId ?? `${source.value}-${index}`}
                  source={source}
                  tokens={tokens}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Detected fields ── */}
        {hasProposal && proposed && (
          <div className="flex flex-col gap-3">
            <span
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: tokens.textTertiary }}
            >
              Campos detectados
            </span>

            {editing ? (
              <div className="flex flex-col gap-3">
                <FieldRow label="Nome do negócio" tokens={tokens}>
                  <Input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Ex.: Barbearia do João"
                    disabled={disabled}
                    className="h-8 text-[12px]"
                    aria-label="Nome do negócio"
                  />
                </FieldRow>
                <ChipList
                  heading="Serviços"
                  placeholder="Ex.: corte, barba…"
                  items={services}
                  onAdd={addService}
                  onRemove={removeService}
                  tokens={tokens}
                  disabled={disabled}
                />
                <FieldRow label="Público-alvo" tokens={tokens}>
                  <Input
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="Ex.: homens 25-45 da região"
                    disabled={disabled}
                    className="h-8 text-[12px]"
                    aria-label="Público-alvo"
                  />
                </FieldRow>
                <ChipList
                  heading="Diferenciais"
                  placeholder="Ex.: atendimento sem fila…"
                  items={differentiators}
                  onAdd={addDifferentiator}
                  onRemove={removeDifferentiator}
                  tokens={tokens}
                  disabled={disabled}
                />
                <FieldRow label="Tom de voz" tokens={tokens}>
                  <Input
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    placeholder="Ex.: amigável e direto"
                    disabled={disabled}
                    className="h-8 text-[12px]"
                    aria-label="Tom de voz"
                  />
                </FieldRow>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {proposed.businessName && (
                  <FieldRow label="Nome do negócio" tokens={tokens}>
                    <span
                      className="text-[13px]"
                      style={{ color: tokens.textPrimary }}
                    >
                      {proposed.businessName}
                    </span>
                  </FieldRow>
                )}
                {proposed.services && proposed.services.length > 0 && (
                  <FieldRow label="Serviços" tokens={tokens}>
                    <ReadChips items={proposed.services} tokens={tokens} />
                  </FieldRow>
                )}
                {proposed.audience && (
                  <FieldRow label="Público-alvo" tokens={tokens}>
                    <span
                      className="text-[13px]"
                      style={{ color: tokens.textPrimary }}
                    >
                      {proposed.audience}
                    </span>
                  </FieldRow>
                )}
                {proposed.differentiators &&
                  proposed.differentiators.length > 0 && (
                    <FieldRow label="Diferenciais" tokens={tokens}>
                      <ReadChips
                        items={proposed.differentiators}
                        tokens={tokens}
                      />
                    </FieldRow>
                  )}
                {proposed.tone && (
                  <FieldRow label="Tom de voz" tokens={tokens}>
                    <span
                      className="text-[13px]"
                      style={{ color: tokens.textPrimary }}
                    >
                      {proposed.tone}
                    </span>
                  </FieldRow>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </CardShell>
  )
}

export default SourceProgressCard
