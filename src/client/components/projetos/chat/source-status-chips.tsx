"use client"

import * as React from "react"
import { CircleAlert, CircleCheck, Clock, Loader2 } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { fetchWithAuthRetry } from "@/lib/auth/client-refresh"
import type { SourceIngestionItem } from "@/server/ai-module/builder/cards/builder-state"

type ChipPhase = "waiting" | "reading" | "ready" | "failed"
type SourceImagesPhase = "pending" | "running" | "ready" | "error"
type SourceSynthesisPhase = "pending" | "running" | "ready" | "error"

interface SourceStatusChipSource {
  value: string
  type: "url" | "instagram"
  status: string
  sourceId?: string
  chunkCount?: number
  error?: string | null
  imagesStatus?: SourceImagesPhase
  imagesCount?: number
  synthesisStatus?: SourceSynthesisPhase
  synthesisError?: string
}

interface SourceStatusChipsProps {
  projectId: string
  seedSources: SourceIngestionItem[]
  sourceConfirmed: boolean
  tokens: AppTokens
}

const POLL_INTERVAL_MS = 2000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function unwrapStatusPayload(body: unknown): unknown {
  if (!isRecord(body)) return body
  if (Array.isArray(body.sources)) return body
  return isRecord(body.data) ? body.data : body
}

function coerceImagesPhase(value: unknown): SourceImagesPhase | undefined {
  if (
    value === "pending" ||
    value === "running" ||
    value === "ready" ||
    value === "error"
  ) {
    return value
  }
  return undefined
}

function coerceSynthesisPhase(value: unknown): SourceSynthesisPhase | undefined {
  if (
    value === "pending" ||
    value === "running" ||
    value === "ready" ||
    value === "error"
  ) {
    return value
  }
  return undefined
}

function parseStatusSources(body: unknown): SourceStatusChipSource[] {
  const root = unwrapStatusPayload(body)
  if (!isRecord(root) || !Array.isArray(root.sources)) return []

  const out: SourceStatusChipSource[] = []
  for (const entry of root.sources) {
    if (!isRecord(entry)) continue

    const value = entry.value ?? entry.source
    const type = entry.type
    if (typeof value !== "string") continue

    out.push({
      value,
      type: type === "instagram" ? "instagram" : "url",
      status: typeof entry.status === "string" ? entry.status : "pending",
      sourceId:
        typeof entry.sourceId === "string"
          ? entry.sourceId
          : typeof entry.id === "string"
            ? entry.id
            : undefined,
      chunkCount:
        typeof entry.chunkCount === "number" ? entry.chunkCount : undefined,
      error: typeof entry.error === "string" ? entry.error : null,
      imagesStatus: coerceImagesPhase(entry.imagesStatus),
      imagesCount:
        typeof entry.imagesCount === "number" ? entry.imagesCount : undefined,
      synthesisStatus: coerceSynthesisPhase(entry.synthesisStatus),
      synthesisError:
        typeof entry.synthesisError === "string"
          ? entry.synthesisError
          : undefined,
    })
  }

  return out
}

function normalizeSeedSources(
  seedSources: SourceIngestionItem[],
): SourceStatusChipSource[] {
  return seedSources.map((source) => ({
    value: source.value,
    type: source.type,
    status: source.status,
    sourceId: source.sourceId,
    imagesStatus: source.imagesStatus,
    imagesCount: source.imagesCount,
    synthesisStatus: source.synthesisStatus,
    synthesisError: source.synthesisError,
  }))
}

function resolvePhase(
  status: string | undefined,
  synthesisStatus?: SourceSynthesisPhase,
): ChipPhase {
  if (synthesisStatus === "error") return "failed"
  if (synthesisStatus === "running") return "reading"
  if (synthesisStatus === "pending" && status === "ready") return "reading"

  const normalized = (status ?? "").trim().toLowerCase()
  if (
    normalized === "ready" ||
    normalized === "done" ||
    normalized === "ok" ||
    normalized === "completed"
  ) {
    return "ready"
  }
  if (
    normalized === "error" ||
    normalized === "failed" ||
    normalized === "errored"
  ) {
    return "failed"
  }
  if (
    normalized === "processing" ||
    normalized === "running" ||
    normalized === "ingesting" ||
    normalized === "in_progress"
  ) {
    return "reading"
  }
  return "waiting"
}

function isSettled(phase: ChipPhase): boolean {
  return phase === "ready" || phase === "failed"
}

function hasActiveImages(source: SourceStatusChipSource): boolean {
  return source.imagesStatus === "pending" || source.imagesStatus === "running"
}

function isSourceSettledForPoll(source: SourceStatusChipSource): boolean {
  return (
    isSettled(resolvePhase(source.status, source.synthesisStatus)) &&
    !hasActiveImages(source)
  )
}

function sourceSignature(sources: SourceIngestionItem[]): string {
  return sources
    .map(
      (source) =>
        [
          source.sourceId ?? "",
          source.value,
          source.type,
          source.status,
          source.imagesStatus ?? "",
          source.imagesCount ?? "",
        ].join("|"),
    )
    .join("\n")
}

function useSourceStatusChipsPoll(
  projectId: string,
  seedSources: SourceIngestionItem[],
): SourceStatusChipSource[] {
  const seedSignature = React.useMemo(
    () => sourceSignature(seedSources),
    [seedSources],
  )
  const normalizedSeedSources = React.useMemo(
    () => normalizeSeedSources(seedSources),
    [seedSources],
  )
  const [polledSources, setPolledSources] = React.useState<
    SourceStatusChipSource[] | null
  >(null)

  React.useEffect(() => {
    setPolledSources(null)
  }, [projectId, seedSignature])

  const liveSources = polledSources ?? normalizedSeedSources
  const allSettled =
    liveSources.length > 0 &&
    liveSources.every((source) => isSourceSettledForPoll(source))

  React.useEffect(() => {
    if (normalizedSeedSources.length === 0 || allSettled) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const schedule = () => {
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS)
    }

    const tick = async () => {
      try {
        const res = await fetchWithAuthRetry(
          `/api/v1/builder/projects/${projectId}/sources/status`,
          { method: "GET", headers: { Accept: "application/json" } },
          { notifyOnAuthFailure: true },
        )
        if (cancelled) return

        if (res.ok) {
          const sources = parseStatusSources(await res.json())
          if (cancelled) return
          if (sources.length > 0) {
            setPolledSources(sources)
            if (sources.every((source) => isSourceSettledForPoll(source))) {
              return
            }
          }
        }
      } catch {
        // Network/auth blips keep the seed visible and retry on the next tick.
      }

      schedule()
    }

    void tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [allSettled, normalizedSeedSources.length, projectId, seedSignature])

  return liveSources
}

function shortSourceLabel(source: SourceStatusChipSource): string {
  const raw = source.value.trim()
  if (!raw) return "fonte"

  try {
    const url = new URL(raw)
    const host = url.hostname.replace(/^www\./, "")
    if (source.type === "instagram") {
      const handle = url.pathname
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean)
        .find((part) => !["p", "reel", "stories"].includes(part.toLowerCase()))
      return handle ? `@${handle.replace(/^@/, "")}` : host
    }
    return host
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]!
  }
}

function stageLabel(sources: SourceStatusChipSource[]): string {
  const phases = sources.map((source) =>
    resolvePhase(source.status, source.synthesisStatus),
  )
  const allWaiting = phases.every((phase) => phase === "waiting")
  const anyReading = phases.some((phase) => phase === "reading")
  const allReady = phases.every((phase) => phase === "ready")
  const allFailed = phases.every((phase) => phase === "failed")
  const anyFailed = phases.some((phase) => phase === "failed")
  const anyActiveImages = sources.some(hasActiveImages)

  if (allFailed) return "Não consegui ler as fontes"
  if (anyReading) return "Estou lendo as fontes"
  if (allWaiting) return "Aguardando leitura das fontes"
  if (allReady && anyActiveImages) return "Separando as fotos"
  if (allReady) return "Fontes prontas para revisão"
  if (anyFailed) return "Algumas fontes precisam de atenção"
  return "Atualizando fontes"
}

function phaseTone(
  phase: ChipPhase,
  tokens: AppTokens,
): { bg: string; fg: string; border: string; icon: React.ReactNode } {
  if (phase === "ready") {
    return {
      bg: tokens.successSubtle,
      fg: tokens.successText,
      border: tokens.success,
      icon: <CircleCheck className="h-3 w-3" aria-hidden="true" />,
    }
  }
  if (phase === "failed") {
    return {
      bg: tokens.dangerSubtle,
      fg: tokens.dangerText,
      border: tokens.danger,
      icon: <CircleAlert className="h-3 w-3" aria-hidden="true" />,
    }
  }
  if (phase === "reading") {
    return {
      bg: tokens.warningSubtle,
      fg: tokens.warningText,
      border: tokens.warning,
      icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />,
    }
  }
  return {
    bg: tokens.hoverBg,
    fg: tokens.textTertiary,
    border: tokens.border,
    icon: <Clock className="h-3 w-3" aria-hidden="true" />,
  }
}

function phaseLabel(phase: ChipPhase): string {
  if (phase === "reading") return "lendo"
  if (phase === "ready") return "pronto"
  if (phase === "failed") return "falhou"
  return "aguardando"
}

function chipDetail(source: SourceStatusChipSource, phase: ChipPhase): string {
  if (phase === "ready") return "conteúdo salvo"
  if (phase === "reading" && source.chunkCount && source.chunkCount > 0) {
    return "organizando"
  }
  return ""
}

function SourceChip({
  source,
  tokens,
}: {
  source: SourceStatusChipSource
  tokens: AppTokens
}) {
  const phase = resolvePhase(source.status, source.synthesisStatus)
  const tone = phaseTone(phase, tokens)
  const detail = chipDetail(source, phase)

  const chip = (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium leading-none"
      style={{
        backgroundColor: tone.bg,
        borderColor: tone.border,
        color: tone.fg,
      }}
    >
      <span className="shrink-0">{tone.icon}</span>
      <span className="truncate">{shortSourceLabel(source)}</span>
      <span aria-hidden="true" style={{ color: tokens.textTertiary }}>
        ·
      </span>
      <span className="shrink-0">{phaseLabel(phase)}</span>
      {detail ? (
        <>
          <span aria-hidden="true" style={{ color: tokens.textTertiary }}>
            ·
          </span>
          <span className="shrink-0">{detail}</span>
        </>
      ) : null}
    </span>
  )

  if (phase !== "failed") return chip

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="top">
        {source.synthesisError || source.error || "Não consegui ler esta fonte."}
      </TooltipContent>
    </Tooltip>
  )
}

export function SourceStatusChips({
  projectId,
  seedSources,
  sourceConfirmed,
  tokens,
}: SourceStatusChipsProps) {
  const sources = useSourceStatusChipsPoll(projectId, seedSources)

  if (sourceConfirmed || sources.length === 0) return null

  return (
    <div
      className="mx-auto mt-5 w-full max-w-2xl"
      aria-live="polite"
      aria-label="Status das fontes"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className="text-[11px] font-medium"
          style={{ color: tokens.textSecondary }}
        >
          {stageLabel(sources)}
        </span>
        <span
          className="h-1 w-1 rounded-full"
          style={{ backgroundColor: tokens.border }}
          aria-hidden="true"
        />
        {sources.map((source, index) => (
          <SourceChip
            key={source.sourceId ?? `${source.value}-${index}`}
            source={source}
            tokens={tokens}
          />
        ))}
      </div>
    </div>
  )
}
