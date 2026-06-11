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
 *   2. "O que encontrei" — the PROPOSED synthesis from
 *      `value.sourceIngestion.proposed` (businessName / services / audience /
 *      differentiators / tone / address / description). These are
 *      anti-hallucination PROPOSALS: they only
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
  Images,
  Instagram,
  Loader2,
  Pencil,
  RefreshCcw,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react"

import { Input } from "@/client/components/ui/input"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { fetchWithAuthRetry } from "@/lib/auth/client-refresh"
import type {
  SourceIngestionItem,
  SourceProposal,
} from "@/server/ai-module/builder/cards/builder-state"

import { CardShell, type CardShellAction } from "./card-shell"
import {
  ImagesPreviewPanel,
  type CuratedImage,
} from "./sources/images-preview-panel"
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
    /** Onda E — endereço físico completo detectado na fonte. */
    address?: string
    /** Onda E — descrição do negócio (1-2 frases) detectada na fonte. */
    description?: string
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

/** Image-catalog mirror status per source (Onda D, vision/G2). */
type SourceImagesPhase = "pending" | "running" | "ready" | "error"
type SourceSynthesisPhase = "pending" | "running" | "ready" | "error"

type RetrySynthesisAction = {
  method: "POST"
  path: string
}

type SourceProgressSource = SourceIngestionItem & {
  synthesisStatus?: SourceSynthesisPhase
  synthesisError?: string
  synthesisAttempts?: number
  canRetrySynthesis?: boolean
  retrySynthesis?: RetrySynthesisAction | null
}

/**
 * Structural shape of one source row returned by the status endpoint. Kept
 * permissive (mirrors `SourceIngestionItem`) so a slightly-richer payload from
 * the route doesn't break parsing; we read `value`/`type`/`status`/`sourceId`
 * plus the LEAN image-catalog mirror (`imagesStatus`/`imagesCount`) — the latter
 * two gate the SEPARATE images poll (D3), never the text/proposed poll.
 */
interface StatusEndpointSource {
  value: string
  type: "url" | "instagram"
  status: string
  sourceId?: string
  /** Per-source image-extraction phase; the images poll stops at ready|error. */
  imagesStatus?: SourceImagesPhase
  /** Count of extracted images for this source (informational). */
  imagesCount?: number
  synthesisStatus?: SourceSynthesisPhase
  synthesisError?: string
  synthesisAttempts?: number
  canRetrySynthesis?: boolean
  retrySynthesis?: RetrySynthesisAction | null
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

/** Unwrap Igniter/fetch envelopes like `{ data: ... }` and array-wrapped bodies. */
function unwrapDataEnvelope(v: unknown): unknown {
  if (Array.isArray(v)) return unwrapDataEnvelope(v[0])
  if (isRecord(v) && "data" in v) return unwrapDataEnvelope(v.data)
  return v
}

/** Coerce an unknown value into a `SourceImagesPhase` (undefined when absent). */
function coerceImagesPhase(v: unknown): SourceImagesPhase | undefined {
  if (
    v === "pending" ||
    v === "running" ||
    v === "ready" ||
    v === "error"
  ) {
    return v
  }
  return undefined
}

function coerceSynthesisPhase(v: unknown): SourceSynthesisPhase | undefined {
  if (
    v === "pending" ||
    v === "running" ||
    v === "ready" ||
    v === "error"
  ) {
    return v
  }
  return undefined
}

function coerceRetrySynthesisAction(v: unknown): RetrySynthesisAction | null {
  if (!isRecord(v)) return null
  if (v.method !== "POST") return null
  if (typeof v.path !== "string" || v.path.length === 0) return null
  return { method: "POST", path: v.path }
}

/** Coerce an unknown JSON body into `StatusEndpointSource[]` (never throws). */
function parseStatusSources(body: unknown): StatusEndpointSource[] {
  const root = unwrapDataEnvelope(body)
  if (!isRecord(root)) return []
  const raw = root.sources
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
      // LEAN image-catalog mirror — additive, optional; absent on legacy rows.
      imagesStatus: coerceImagesPhase(entry.imagesStatus),
      imagesCount:
        typeof entry.imagesCount === "number" ? entry.imagesCount : undefined,
      synthesisStatus: coerceSynthesisPhase(entry.synthesisStatus),
      synthesisError:
        typeof entry.synthesisError === "string"
          ? entry.synthesisError
          : undefined,
      synthesisAttempts:
        typeof entry.synthesisAttempts === "number"
          ? entry.synthesisAttempts
          : undefined,
      canRetrySynthesis: entry.canRetrySynthesis === true,
      retrySynthesis: coerceRetrySynthesisAction(entry.retrySynthesis),
    })
  }
  return out
}

/** Extract the (optional) proposal from a status response (never throws). */
function parseStatusProposed(body: unknown): SourceProposal | undefined {
  const root = unwrapDataEnvelope(body)
  if (!isRecord(root)) return undefined
  const p = root.proposed
  if (!isRecord(p)) return undefined
  const businessName = typeof p.businessName === "string" ? p.businessName : undefined
  const audience = typeof p.audience === "string" ? p.audience : undefined
  const tone = typeof p.tone === "string" ? p.tone : undefined
  const address = typeof p.address === "string" ? p.address : undefined
  const description = typeof p.description === "string" ? p.description : undefined
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
  if (address) proposal.address = address
  if (description) proposal.description = description
  return Object.keys(proposal).length > 0 ? proposal : undefined
}

// ──────────────────────────────────────────────────────────────────────────
// Image catalog (D3) — tolerant parse of the listSourceImages payload
// ──────────────────────────────────────────────────────────────────────────

/** Coerce an unknown JSON value into `string | null` (anything else → null). */
function asNullableString(v: unknown): string | null {
  return typeof v === "string" ? v : null
}

/** Coerce an unknown JSON value into `number | null` (anything else → null). */
function asNullableNumber(v: unknown): number | null {
  return typeof v === "number" ? v : null
}

/**
 * Coerce ONE unknown entry into a `CuratedImage`, or `null` when it lacks the
 * required identity fields. `imageUrl` is nullable by design (fail-safe per item
 * on the route). For local storage, old responses may include an absolute
 * `/api/v1/files/...` URL with a stale dev port; we normalize that to a
 * same-origin path before rendering, without changing the storage config.
 */
function asCuratedImage(entry: unknown): CuratedImage | null {
  if (!isRecord(entry)) return null
  const { id, sourceId, collectionId, originalUrl, createdAt } = entry
  if (
    typeof id !== "string" ||
    typeof sourceId !== "string" ||
    typeof collectionId !== "string" ||
    typeof originalUrl !== "string" ||
    typeof createdAt !== "string"
  ) {
    return null
  }
  return {
    id,
    sourceId,
    collectionId,
    originalUrl,
    imageUrl: normalizeImageUrl(entry.imageUrl),
    caption: asNullableString(entry.caption),
    width: asNullableNumber(entry.width),
    height: asNullableNumber(entry.height),
    sizeBytes: asNullableNumber(entry.sizeBytes),
    mimeType: asNullableString(entry.mimeType),
    confirmedAt: asNullableString(entry.confirmedAt),
    createdAt,
  }
}

/**
 * Render-safe media URL. Absolute local-storage links can point to the wrong dev
 * port; if they target the app file route, use a relative path so the current
 * origin serves the image. Third-party http(s) URLs are kept as-is.
 */
function normalizeImageUrl(raw: unknown): string | null {
  const value = asNullableString(raw)?.trim()
  if (!value) return null
  if (value.startsWith("/api/v1/files/")) return value

  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    const url = new URL(value, base)
    const filesIndex = url.pathname.indexOf("/api/v1/files/")
    if (filesIndex >= 0) {
      return `${url.pathname.slice(filesIndex)}${url.search}${url.hash}`
    }
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString()
    }
  } catch {
    return null
  }
  return null
}

/**
 * Tolerant unwrap of the `listSourceImages` response into `CuratedImage[]`.
 * Igniter/fetch may hand back the `response.success({ images })` payload directly
 * (`{ images }`), enveloped (`{ data: { images } }`) or array-wrapped depending
 * on the caller path. Accept all of them and never throw.
 */
function parseCuratedImages(data: unknown): CuratedImage[] {
  const root = unwrapDataEnvelope(data)
  if (!isRecord(root)) return []
  const raw = root.images
  if (!Array.isArray(raw)) return []
  const out: CuratedImage[] = []
  for (const entry of raw) {
    const img = asCuratedImage(entry)
    if (img) out.push(img)
  }
  return out
}

interface SourceImagesQuery {
  images: CuratedImage[]
  isLoading: boolean
  hasError: boolean
  refetch: () => Promise<void>
}

function useSourceImages(projectId: string): SourceImagesQuery {
  const mounted = React.useRef(true)
  const [state, setState] = React.useState<{
    images: CuratedImage[]
    isLoading: boolean
    hasError: boolean
  }>({ images: [], isLoading: true, hasError: false })

  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refetch = React.useCallback(async () => {
    setState((cur) => ({
      ...cur,
      isLoading: cur.images.length === 0,
      hasError: false,
    }))
    try {
      const res = await fetchWithAuthRetry(
        `/api/v1/builder/projects/${projectId}/sources/images`,
        { method: "GET", headers: { Accept: "application/json" } },
        { notifyOnAuthFailure: true },
      )
      if (!res.ok) throw new Error(`listSourceImages ${res.status}`)
      const body: unknown = await res.json()
      const images = parseCuratedImages(body)
      if (!mounted.current) return
      setState({ images, isLoading: false, hasError: false })
    } catch {
      if (!mounted.current) return
      setState((cur) => ({ ...cur, isLoading: false, hasError: true }))
    }
  }, [projectId])

  React.useEffect(() => {
    void refetch()
  }, [refetch])

  return {
    images: state.images,
    isLoading: state.isLoading,
    hasError: state.hasError,
    refetch,
  }
}

interface PollResult {
  /** Live sources merged from the poll (falls back to seed when not polled yet). */
  sources: SourceProgressSource[]
  /** Live proposal from the poll, when the endpoint includes it. */
  proposed: SourceProposal | undefined
  /**
   * `true` once every source's image-catalog mirror has SETTLED (`ready`|`error`),
   * OR the mirror is simply absent on all of them (legacy / no-vision path).
   * It is the STOP condition for the SEPARATE images poll (D3) — distinct from the
   * text/`status` settle that governs the proposal poll above. Defaults to `true`
   * when there are no sources, so the images query never spins on an empty list.
   */
  imagesAllReady: boolean
  markSynthesisRunning: (sourceId: string) => void
}

type PollState = Omit<PollResult, "markSynthesisRunning">

/**
 * Derive whether the image catalog has finished for ALL sources. A source counts
 * as settled when its `imagesStatus` is `ready`/`error`, or when the mirror is
 * absent (`undefined`) — the latter so legacy states (no vision pipeline) never
 * keep the images query polling forever.
 */
function deriveImagesAllReady(
  sources: Array<{ imagesStatus?: SourceImagesPhase }>,
): boolean {
  if (sources.length === 0) return true
  return sources.every(
    (s) =>
      s.imagesStatus == null ||
      s.imagesStatus === "ready" ||
      s.imagesStatus === "error",
  )
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
  const [polled, setPolled] = React.useState<PollState | null>(null)

  // Whether all KNOWN sources have settled — derived from the freshest data
  // (polled if present, else the seed). Drives whether the interval keeps going.
  const liveSources = polled?.sources ?? seedSources
  const textSettled =
    liveSources.length > 0 &&
    liveSources.every((s) => isSettled(resolvePhase(s.status)))
  // The image-catalog mirror can lag behind the text settle, so the status poll
  // must keep running while EITHER text OR images are still in flight — this is
  // what keeps `imagesStatus` fresh for the separate images query (D3).
  const imagesAllReady = deriveImagesAllReady(liveSources)
  const allSettled = textSettled && imagesAllReady

  React.useEffect(() => {
    // Nothing to track, or everything already settled: no poll loop.
    if (seedSources.length === 0) return
    if (allSettled) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      try {
        const res = await fetchWithAuthRetry(
          `/api/v1/builder/projects/${projectId}/sources/status`,
          { method: "GET", headers: { Accept: "application/json" } },
          { notifyOnAuthFailure: true },
        )
        if (cancelled) return
        if (res.ok) {
          const body: unknown = await res.json()
          if (cancelled) return
          const sources = parseStatusSources(body)
          const proposed = parseStatusProposed(body)
          if (sources.length > 0 || proposed) {
            const nextSources = sources.length > 0 ? sources : liveSources
            setPolled({
              sources: nextSources,
              proposed: proposed ?? polled?.proposed,
              imagesAllReady: deriveImagesAllReady(nextSources),
            })
          }
          // Stop the loop once the freshest poll shows BOTH the text status and
          // the image-catalog mirror settled for every source.
          const settled =
            sources.length > 0 &&
            sources.every((s) => isSettled(resolvePhase(s.status))) &&
            deriveImagesAllReady(sources)
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

  const markSynthesisRunning = React.useCallback(
    (sourceId: string) => {
      setPolled((cur) => {
        const currentSources = cur?.sources ?? seedSources
        const nextSources = currentSources.map((source) => {
          if (source.sourceId !== sourceId) return source
          const { synthesisError: _drop, ...rest } = source
          const nextSource: SourceProgressSource = {
            ...rest,
            status: "processing",
            synthesisStatus: "running",
            canRetrySynthesis: false,
            retrySynthesis: null,
          }
          return nextSource
        })
        return {
          sources: nextSources,
          proposed: cur?.proposed ?? seedProposed,
          imagesAllReady: deriveImagesAllReady(nextSources),
        }
      })
    },
    [seedProposed, seedSources],
  )

  return {
    sources: polled?.sources ?? seedSources,
    proposed: polled?.proposed ?? seedProposed,
    // `imagesAllReady` is derived above from the freshest data (polled ?? seed),
    // so the images query (D3) can gate its own `refetchInterval` on it.
    imagesAllReady,
    markSynthesisRunning,
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
  source: SourceProgressSource
  tokens: AppTokens
}) {
  const phase =
    source.synthesisStatus === "running"
      ? "processing"
      : source.synthesisStatus === "error" && source.status === "ready"
        ? "error"
        : resolvePhase(source.status)
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
// Proposal summary
// ──────────────────────────────────────────────────────────────────────────

const PROPOSAL_FIELDS: Array<{
  key: keyof SourceProposal
  label: string
  hasValue: (proposal: SourceProposal) => boolean
}> = [
  {
    key: "businessName",
    label: "nome",
    hasValue: (proposal) => Boolean(proposal.businessName?.trim()),
  },
  {
    key: "services",
    label: "serviços",
    hasValue: (proposal) => Boolean(proposal.services?.length),
  },
  {
    key: "audience",
    label: "público",
    hasValue: (proposal) => Boolean(proposal.audience?.trim()),
  },
  {
    key: "differentiators",
    label: "diferenciais",
    hasValue: (proposal) => Boolean(proposal.differentiators?.length),
  },
  {
    key: "tone",
    label: "tom de voz",
    hasValue: (proposal) => Boolean(proposal.tone?.trim()),
  },
  {
    key: "address",
    label: "endereço",
    hasValue: (proposal) => Boolean(proposal.address?.trim()),
  },
  {
    key: "description",
    label: "descrição",
    hasValue: (proposal) => Boolean(proposal.description?.trim()),
  },
]

function formatPortugueseList(items: string[]): string {
  if (items.length === 0) return ""
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} e ${items[1]}`
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`
}

function proposalReason(proposal: SourceProposal): React.ReactNode {
  const found = PROPOSAL_FIELDS.filter((field) => field.hasValue(proposal)).map(
    (field) => field.label,
  )
  const missing = PROPOSAL_FIELDS.filter(
    (field) => !field.hasValue(proposal),
  ).map((field) => field.label)
  const foundText = formatPortugueseList(found) || "algumas informações"
  const missingText =
    formatPortugueseList(missing) || "qualquer ajuste fino que quiser"

  return (
    <>
      Li seu site e encontrei: <strong>{foundText}</strong>. Você pode completar:{" "}
      <strong>{missingText}</strong> — me conte aqui no chat ou toque em Editar.
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Manual photo upload empty state
// ──────────────────────────────────────────────────────────────────────────

const MANUAL_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif"
const MANUAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024

function manualUploadErrorMessage(status: number, errorCode: string | null): string {
  if (status === 401) return "Sua sessão expirou. Entre de novo para continuar."
  if (status === 413) return "Foto grande demais. Use uma imagem de até 5MB."
  if (status === 415) return "Tipo não suportado. Use JPG, PNG, WebP ou GIF."
  if (status === 503) return "Não consegui acessar o armazenamento agora."
  switch (errorCode) {
    case "file_too_large":
      return "Foto grande demais. Use uma imagem de até 5MB."
    case "unsupported_media":
    case "invalid_media_signature":
      return "Tipo não suportado. Use JPG, PNG, WebP ou GIF."
    case "storage_unavailable":
    case "collection_unavailable":
      return "Não consegui acessar o armazenamento agora."
    default:
      return "Não consegui enviar a foto agora."
  }
}

async function parseUploadErrorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: unknown }
    return typeof body.error === "string" ? body.error : null
  } catch {
    return null
  }
}

function SourceImagesEmptyState({
  projectId,
  tokens,
  disabled,
  extractionFailed,
  loadingFailed,
  onUploaded,
}: {
  projectId: string
  tokens: AppTokens
  disabled: boolean
  extractionFailed: boolean
  loadingFailed: boolean
  onUploaded: () => void
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const handleFile = React.useCallback(
    async (file: File) => {
      setNotice(null)
      setError(null)

      if (!file.type.startsWith("image/")) {
        setError("Use uma foto em JPG, PNG, WebP ou GIF.")
        return
      }
      if (file.size > MANUAL_IMAGE_MAX_BYTES) {
        setError("Foto grande demais. Use uma imagem de até 5MB.")
        return
      }

      const body = new FormData()
      body.append("projectId", projectId)
      body.append("file", file)

      setUploading(true)
      try {
        const res = await fetchWithAuthRetry(
          "/api/v1/builder/media/upload",
          { method: "POST", headers: { Accept: "application/json" }, body },
          { notifyOnAuthFailure: true },
        )
        if (!res.ok) {
          const code = await parseUploadErrorCode(res)
          throw new Error(manualUploadErrorMessage(res.status, code))
        }
        setNotice(
          "Foto enviada para o catálogo do agente. Ela já pode ser usada nas conversas.",
        )
        onUploaded()
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Não consegui enviar a foto agora.",
        )
      } finally {
        setUploading(false)
        if (inputRef.current) inputRef.current.value = ""
      }
    },
    [onUploaded, projectId],
  )

  const headline = loadingFailed
    ? "Não consegui carregar as fotos agora."
    : extractionFailed
      ? "Não consegui ler as fotos desta fonte."
      : "Não encontrei fotos prontas para mostrar aqui."

  return (
    <div
      className="flex flex-col gap-3 rounded-md border px-3 py-3 text-[12px]"
      style={{
        backgroundColor: tokens.bgBase,
        borderColor: tokens.divider,
        color: tokens.textSecondary,
      }}
    >
      <div className="flex items-start gap-2">
        <Images
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
          style={{ color: tokens.textTertiary }}
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
          <span style={{ color: tokens.textPrimary }}>{headline}</span>
          <span style={{ color: tokens.textTertiary }}>
            Adicione fotos manualmente se quiser. Fotos aprovadas ficam
            disponíveis para a IA enviar nas conversas com clientes.
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={MANUAL_IMAGE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: tokens.brandSubtle,
            borderColor: tokens.brandBorder,
            color: tokens.brandText,
          }}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {uploading ? "Enviando foto..." : "Adicionar fotos ao agente"}
        </button>
      </div>

      {notice && (
        <p className="text-[11px]" style={{ color: tokens.successText }}>
          {notice}
        </p>
      )}
      {error && (
        <p className="text-[11px]" style={{ color: tokens.dangerText }}>
          {error}
        </p>
      )}
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
  // endpoint returns one) over the canonical seed. `imagesAllReady` is the lean
  // image-catalog mirror's settle flag — it gates the SEPARATE images query (D3).
  const { sources, proposed, imagesAllReady, markSynthesisRunning } =
    useSourceStatusPoll(projectId, seedSources, seedProposed)

  // ── Catálogo de fotos (Onda D3) — galeria de curadoria visual ─────────────
  // O card é dono do fetch autenticado; o panel é dono da curadoria. NÃO usamos
  // o `refetchInterval` do client porque ele não reage à virada de
  // `imagesAllReady`, e aqui precisamos do mesmo retry de sessão usado no poll.
  const imagesQuery = useSourceImages(projectId)
  const images = imagesQuery.images
  const imagesLoading = imagesQuery.isLoading
  const refetchImages = imagesQuery.refetch

  React.useEffect(() => {
    if (imagesAllReady) return
    const timer = setInterval(() => {
      void refetchImages()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [imagesAllReady, refetchImages])
  // Estados da zona: enquanto o espelho não settla OU o 1º fetch está em voo, e a
  // lista está vazia → loading; settled + fetch resolvido + lista vazia → empty;
  // lista com itens → galeria (mesmo durante poll). Incluir `imagesLoading` evita
  // piscar o empty antes da query resolver quando o espelho já está settled.
  const imagesCatalogLoading =
    (!imagesAllReady || imagesLoading) && images.length === 0
  const imagesCatalogEmpty =
    imagesAllReady && !imagesLoading && images.length === 0
  const imagesCatalogError =
    imagesQuery.hasError && !imagesLoading && images.length === 0
  // Copy honesta no vazio: erro de extração ≠ fonte sem fotos. O espelho
  // por fonte (`imagesStatus`) distingue — alguma fonte com `error` mantém a
  // mensagem de falha; todas settladas sem falha e 0 imagens é vazio legítimo.
  const imagesAnyError = sources.some(
    (source) => source.imagesStatus === "error",
  )

  const hasProposal =
    proposed != null &&
    Boolean(
      proposed.businessName ||
        (proposed.services && proposed.services.length > 0) ||
        proposed.audience ||
        (proposed.differentiators && proposed.differentiators.length > 0) ||
        proposed.tone ||
        proposed.address ||
        proposed.description,
    )

  // Fontes assentadas sem proposta → estado de reparo EXPLÍCITO, em vez do
  // "aguarde concluir" eterno com o Aceitar mudo desabilitado.
  const textSettled =
    sources.length > 0 &&
    sources.every((source) => isSettled(resolvePhase(source.status)))
  const allErrored =
    sources.length > 0 &&
    sources.every((source) => resolvePhase(source.status) === "error")
  const hasSettledWithoutProposal =
    textSettled && !hasProposal && !alreadyConfirmed
  const hasFailedWithoutProposal =
    (allErrored || hasSettledWithoutProposal) && !hasProposal && !alreadyConfirmed
  const retryableSynthesisSource = React.useMemo(
    () =>
      sources.find(
        (source) =>
          source.canRetrySynthesis === true &&
          source.retrySynthesis?.method === "POST" &&
          typeof source.retrySynthesis.path === "string" &&
          source.retrySynthesis.path.length > 0 &&
          typeof source.sourceId === "string",
      ) ?? null,
    [sources],
  )
  const [retryingSourceId, setRetryingSourceId] = React.useState<string | null>(
    null,
  )
  const retryingSynthesis = retryingSourceId !== null

  const handleRetrySynthesis = React.useCallback(async () => {
    const source = retryableSynthesisSource
    const sourceId = source?.sourceId
    const path = source?.retrySynthesis?.path
    if (!sourceId || !path) return

    setRetryingSourceId(sourceId)
    try {
      const res = await fetchWithAuthRetry(
        path,
        { method: "POST", headers: { Accept: "application/json" } },
        { notifyOnAuthFailure: true },
      )
      if (!res.ok) throw new Error(`retry synthesis ${res.status}`)
      const body: unknown = await res.json().catch(() => null)
      const retryAccepted =
        isRecord(body) &&
        (body.queued === true || body.synthesisStatus === "running")
      if (!retryAccepted) throw new Error("retry synthesis not accepted")
      markSynthesisRunning(sourceId)
    } catch {
      // Keep the failed state visible; the user can try again or continue manually.
    } finally {
      setRetryingSourceId(null)
    }
  }, [markSynthesisRunning, retryableSynthesisSource])

  // ── Edit mode + draft (seeded from the proposal) ────────────────────────
  const [editing, setEditing] = React.useState(false)
  const [businessName, setBusinessName] = React.useState("")
  const [services, setServices] = React.useState<string[]>([])
  const [audience, setAudience] = React.useState("")
  const [differentiators, setDifferentiators] = React.useState<string[]>([])
  const [tone, setTone] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [description, setDescription] = React.useState("")

  const enterEdit = React.useCallback(() => {
    // Seed the draft from the freshest proposal at the moment "Editar" is pressed.
    setBusinessName(proposed?.businessName ?? "")
    setServices(proposed?.services ?? [])
    setAudience(proposed?.audience ?? "")
    setDifferentiators(proposed?.differentiators ?? [])
    setTone(proposed?.tone ?? "")
    setAddress(proposed?.address ?? "")
    setDescription(proposed?.description ?? "")
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
    const trimmedAddress = address.trim()
    const trimmedDescription = description.trim()
    if (trimmedName) edited.businessName = trimmedName
    if (services.length > 0) edited.services = services
    if (trimmedAudience) edited.audience = trimmedAudience
    if (differentiators.length > 0) edited.differentiators = differentiators
    if (trimmedTone) edited.tone = trimmedTone
    if (trimmedAddress) edited.address = trimmedAddress
    if (trimmedDescription) edited.description = trimmedDescription
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
    address,
    description,
    onSubmit,
  ])

  // ── Footer actions ──────────────────────────────────────────────────────
  const actions: CardShellAction[] = []
  if (!alreadyConfirmed) {
    actions.push({
      label: "Usar informações no agente",
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
    if (retryableSynthesisSource && hasFailedWithoutProposal && !editing) {
      actions.push({
        label: retryingSynthesis ? "Tentando de novo..." : "Tentar de novo",
        onClick: () => {
          void handleRetrySynthesis()
        },
        variant: "secondary",
        icon: retryingSynthesis ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCcw className="h-3.5 w-3.5" />
        ),
        disabled: disabled || retryingSynthesis,
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
    ? "Pronto! Usei essas informações para montar seu agente. Quer ajustar algo? É só me dizer aqui no chat."
    : hasFailedWithoutProposal
      ? allErrored
        ? "Não consegui ler suas fontes. Verifique o link, cole de novo ou me conte as informações no chat."
        : "Li seu site, mas não consegui terminar de organizar as informações. Nada se perdeu — você pode me contar os dados no chat."
      : hasProposal && proposed
        ? proposalReason(proposed)
        : "Estou lendo seu site e anotando as informações do negócio. Atualizo aqui sozinho — enquanto isso, me conta: como você prefere que o agente fale com seus clientes?"

  return (
    <CardShell
      icon={<Sparkles className="h-4 w-4" />}
      title="Fontes do negócio"
      reason={reason}
      actions={actions}
      tokens={tokens}
    >
      <div className="flex flex-col gap-4">
        {/* ── Erro: todas as fontes falharam, nenhuma síntese ── */}
        {hasFailedWithoutProposal && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border px-3 py-2.5 text-[12px] leading-relaxed"
            style={{
              backgroundColor: tokens.dangerSubtle,
              borderColor: tokens.danger,
              color: tokens.dangerText,
            }}
          >
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {allErrored
                ? "Não consegui ler o conteúdo dessas fontes. Verifique o link e cole de novo, ou toque em “Agora não” para preencher os campos manualmente."
                : retryableSynthesisSource
                  ? "Li o conteúdo, mas não consegui transformar isso em campos do agente. Toque em “Tentar de novo” ou me conte os dados no chat."
                  : "Li o conteúdo, mas não consegui transformar isso em campos do agente. Você pode me contar no chat ou tocar em “Agora não” para preencher manualmente."}
            </span>
          </div>
        )}

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
              O que encontrei
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
                <FieldRow label="Endereço" tokens={tokens}>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ex.: Rua das Flores, 100, Centro, São Paulo"
                    disabled={disabled}
                    className="h-8 text-[12px]"
                    aria-label="Endereço"
                  />
                </FieldRow>
                <FieldRow label="Descrição" tokens={tokens}>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex.: empreendimento residencial com studios e 2 dorms"
                    disabled={disabled}
                    className="h-8 text-[12px]"
                    aria-label="Descrição"
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
                {proposed.address && (
                  <FieldRow label="Endereço" tokens={tokens}>
                    <span
                      className="text-[13px]"
                      style={{ color: tokens.textPrimary }}
                    >
                      {proposed.address}
                    </span>
                  </FieldRow>
                )}
                {proposed.description && (
                  <FieldRow label="Descrição" tokens={tokens}>
                    <span
                      className="text-[13px]"
                      style={{ color: tokens.textPrimary }}
                    >
                      {proposed.description}
                    </span>
                  </FieldRow>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Catálogo de fotos (Onda D3) — só quando há ao menos uma fonte ── */}
        {sources.length > 0 && (
          <div className="flex flex-col gap-2">
            <span
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: tokens.textTertiary }}
            >
              Catálogo de fotos
            </span>

            <p
              className="text-[12px] leading-relaxed"
              style={{ color: tokens.textSecondary }}
            >
              Seu agente pode enviar estas fotos nas conversas com clientes.
              Remova as que não quiser que ele use.
            </p>

            {imagesCatalogLoading ? (
              <div
                className="flex items-center gap-2 rounded-md border px-3 py-3 text-[12px]"
                style={{
                  backgroundColor: tokens.bgBase,
                  borderColor: tokens.divider,
                  color: tokens.textTertiary,
                }}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Lendo as fotos…</span>
              </div>
            ) : imagesCatalogEmpty || imagesCatalogError ? (
              <SourceImagesEmptyState
                projectId={projectId}
                tokens={tokens}
                disabled={disabled}
                extractionFailed={imagesAnyError}
                loadingFailed={imagesCatalogError}
                onUploaded={() => {
                  void refetchImages()
                }}
              />
            ) : (
              <ImagesPreviewPanel
                projectId={projectId}
                images={images}
                loading={imagesLoading}
                tokens={tokens}
                disabled={disabled}
                onRefetch={refetchImages}
              />
            )}
          </div>
        )}
      </div>
    </CardShell>
  )
}

export default SourceProgressCard
