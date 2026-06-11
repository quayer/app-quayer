"use client"

/**
 * Helpers da CapabilitiesSection (FR-06/07, T44/T45) — extraídos para manter o
 * componente principal ≤300 linhas (FILE_SIZE_GUIDELINES):
 *   - useCapabilities      — o ÚNICO fetch extra além do readiness (getCapabilities).
 *   - useSilentCardSubmit  — POST card-submit com ackMode:'silent' + evento local.
 *   - CapabilityRow        — primitiva visual de uma linha de capacidade.
 *   - InlineCard           — render registry-driven do card expandido inline.
 */

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { api } from "@/igniter.client"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { BuilderState } from "@/server/ai-module/builder/cards/builder-state"
import { getCardDescriptor } from "@/client/components/projetos/chat/cards/card-registry"
import type { CardKey } from "@/client/components/projetos/chat/cards/types"
import { fetchWithAuthRetry } from "@/lib/auth/client-refresh"

// ── getCapabilities query (NFR-05) ─────────────────────────────────────────

export interface CustomToolView {
  id: string
  name: string
  description: string | null
  isActive: boolean
}
export interface CapabilitiesEnvelope {
  customTools?: CustomToolView[]
  mediaImagesCount?: number
  sourceImagesCount?: number
  sourceImagesPendingCount?: number
  knowledgeSourceCount?: number
  calendarConnected?: boolean
}
interface GetCapabilitiesQuery {
  useQuery: (opts: { params: { id: string } }) => {
    data:
      | { success?: boolean; data?: CapabilitiesEnvelope }
      | CapabilitiesEnvelope
      | undefined
    refetch?: () => unknown
  }
}

/**
 * Fetch nativo usado quando o schema/client Igniter ainda não expõe a action
 * gerada. Mantém a identidade do hook estável e evita que a Overview degrade para
 * counts vazios só porque o client gerado ficou atrasado no dev.
 */
const NATIVE_GET_CAPABILITIES_QUERY: GetCapabilitiesQuery = {
  useQuery: ({ params }) => {
    const mounted = React.useRef(false)
    const [data, setData] = React.useState<
      { success?: boolean; data?: CapabilitiesEnvelope } | undefined
    >(undefined)

    const refetch = React.useCallback(async () => {
      try {
        const res = await fetchWithAuthRetry(
          `/api/v1/builder/projects/${params.id}/capabilities`,
          { method: "GET", headers: { Accept: "application/json" } },
          { notifyOnAuthFailure: true },
        )
        if (!res.ok) throw new Error(`getCapabilities ${res.status}`)
        const body = (await res.json()) as {
          success?: boolean
          data?: CapabilitiesEnvelope
        }
        if (mounted.current) setData(body)
      } catch {
        if (mounted.current) setData(undefined)
      }
    }, [params.id])

    React.useEffect(() => {
      mounted.current = true
      void refetch()
      return () => {
        mounted.current = false
      }
    }, [refetch])

    return { data, refetch }
  },
}

/**
 * Resolve `api.builder.getCapabilities` UMA vez (module-eval), com fallback
 * nativo se o client gerado ainda não expõe a action.
 */
const GET_CAPABILITIES_QUERY: GetCapabilitiesQuery = (() => {
  const candidate = (api.builder as { getCapabilities?: unknown }).getCapabilities
  if (
    candidate &&
    typeof (candidate as { useQuery?: unknown }).useQuery === "function"
  ) {
    return candidate as GetCapabilitiesQuery
  }
  return NATIVE_GET_CAPABILITIES_QUERY
})()

export function useCapabilities(projectId: string): {
  data: CapabilitiesEnvelope | undefined
  refetch: () => void
} {
  const query = GET_CAPABILITIES_QUERY.useQuery({ params: { id: projectId } })
  const refetchRef = React.useRef(query.refetch)
  React.useEffect(() => {
    refetchRef.current = query.refetch
  }, [query.refetch])
  const raw = query.data
  const data = React.useMemo<CapabilitiesEnvelope | undefined>(() => {
    if (!raw || typeof raw !== "object") return undefined
    const inner = (raw as { data?: CapabilitiesEnvelope }).data
    return inner && typeof inner === "object"
      ? inner
      : (raw as CapabilitiesEnvelope)
  }, [raw])
  return { data, refetch: () => void refetchRef.current?.() }
}

// ── Silent card-submit (FR-29/T45/T90) ─────────────────────────────────────

/** Linha de sistema local por card (o chat a mostra via builder:capability-toggled). */
const SILENT_LINE: Partial<Record<CardKey, string>> = {
  handoff: "✓ Transferência atualizada",
  pricing: "✓ Preços atualizados",
  calendar_connect: "✓ Agenda atualizada",
}

/**
 * POST direto ao card-submit com `ackMode: 'silent'` — SEM consumir SSE/turno
 * LLM (plan §4.3). Em sucesso, dispara `builder:capability-toggled` que o
 * use-chat-stream traduz numa linha de sistema local no histórico vivo.
 */
export function useSilentCardSubmit(
  projectId: string,
): (cardKey: CardKey, payload: Record<string, unknown>) => void {
  return React.useCallback(
    (cardKey, payload) => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/v1/builder/projects/${projectId}/cards/${cardKey}/submit`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cardKey, ...payload, ackMode: "silent" }),
            },
          )
          if (!res.ok) return
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("builder:capability-toggled", {
                detail: {
                  message: SILENT_LINE[cardKey] ?? "✓ Capacidade atualizada",
                },
              }),
            )
          }
        } catch {
          // Falha silenciosa: o estado não muda; o usuário tenta de novo.
        }
      })()
    },
    [projectId],
  )
}

// ── CapabilityRow ──────────────────────────────────────────────────────────

export interface CapabilityRowProps {
  icon: React.ReactNode
  title: string
  summary: string
  tokens: AppTokens
  /** Estado atual da capacidade (chip à direita). */
  status: { label: string; active: boolean }
  /** Badge extra (ex.: "Sugerido para seu nicho"). */
  badge?: string
  /** Toggle: presente quando a linha é configurável inline. */
  expandable?: boolean
  expanded?: boolean
  onToggle?: () => void
  /** Ação alternativa (ex.: "Abrir Conhecimento") quando não há toggle. */
  action?: { label: string; onClick: () => void }
  children?: React.ReactNode
}

export function CapabilityRow({
  icon,
  title,
  summary,
  tokens,
  status,
  badge,
  expandable,
  expanded,
  onToggle,
  action,
  children,
}: CapabilityRowProps) {
  const sideBtn =
    "flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors"
  return (
    <div
      className="rounded-xl border"
      style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
    >
      <div className="flex items-start gap-3 p-3.5">
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: status.active ? tokens.brandSubtle : tokens.hoverBg,
            color: status.active ? tokens.brand : tokens.textTertiary,
          }}
          aria-hidden="true"
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold" style={{ color: tokens.textPrimary }}>
              {title}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: status.active ? tokens.successSubtle : tokens.hoverBg,
                color: status.active ? tokens.successText : tokens.textTertiary,
              }}
            >
              {status.label}
            </span>
            {badge && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}
              >
                {badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            {summary}
          </p>
        </div>
        {expandable ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className={sideBtn}
            style={{ borderColor: tokens.divider, color: tokens.textSecondary, backgroundColor: tokens.bgBase }}
          >
            {expanded ? "Fechar" : "Configurar"}
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform"
              style={{ transform: expanded ? "rotate(180deg)" : undefined }}
              aria-hidden="true"
            />
          </button>
        ) : action ? (
          <button
            type="button"
            onClick={action.onClick}
            className={sideBtn}
            style={{ borderColor: tokens.divider, color: tokens.textSecondary, backgroundColor: tokens.bgBase }}
          >
            {action.label}
          </button>
        ) : null}
      </div>
      {expanded && children && (
        <div className="border-t p-3.5" style={{ borderColor: tokens.divider, backgroundColor: tokens.bgBase }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── InlineCard (registry-driven) ───────────────────────────────────────────

/**
 * Renderiza o card do registry (handoff/pricing/calendar_connect) inline,
 * submetendo via silent-submit. NÃO há SSE/turno LLM — o flip persiste e o chat
 * recebe a linha de sistema local pelo evento.
 */
export function InlineCard({
  cardKey,
  builderState,
  projectId,
  tokens,
  onSilentSubmit,
}: {
  cardKey: CardKey
  builderState: BuilderState
  projectId: string
  tokens: AppTokens
  onSilentSubmit: (cardKey: CardKey, payload: Record<string, unknown>) => void
}) {
  const descriptor = getCardDescriptor(cardKey)
  if (!descriptor) return null
  const Card = descriptor.component
  return (
    <Card
      projectId={projectId}
      cardKey={cardKey}
      value={builderState}
      onSubmit={(payload: Record<string, unknown>) => onSilentSubmit(cardKey, payload)}
      tokens={tokens}
    />
  )
}
