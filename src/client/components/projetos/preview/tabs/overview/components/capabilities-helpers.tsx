"use client"

/**
 * Helpers da CapabilitiesSection (FR-06/07, T44/T45) — extraídos para manter o
 * componente principal pequeno:
 *   - useCapabilities      — o ÚNICO fetch extra além do readiness (getCapabilities).
 *   - CapabilityRow        — primitiva visual de uma linha de capacidade.
 */

import * as React from "react"

import { useQuery } from "@tanstack/react-query"

import { orpc } from "@/orpc/client"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { CapabilityRecommendation } from "@/server/ai-module/builder/capabilities/recommend-capabilities.pure"

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
  /**
   * Capacidades PRÉ-marcadas pelo recomendador (FR-51/FR-52). Read-only — aceitar
   * uma sugestão roteia para o card/toggle de domínio (nunca grava tool aqui).
   */
  recommendations?: CapabilityRecommendation[]
}
export function useCapabilities(projectId: string): {
  data: CapabilitiesEnvelope | undefined
  refetch: () => void
} {
  // oRPC + TanStack: data do hook = envelope { data: CapabilitiesEnvelope,
  // error: null } (wire idêntico ao Igniter); o payload fica em .data.
  const query = useQuery(
    orpc.builder.getCapabilities.queryOptions({ input: { id: projectId } }),
  )
  const refetchRef = React.useRef(query.refetch)
  React.useEffect(() => {
    refetchRef.current = query.refetch
  }, [query.refetch])
  const raw = query.data
  const data = React.useMemo<CapabilitiesEnvelope | undefined>(
    // Cast: o handler devolve recommendations tipadas como unknown[] no wire
    // (jsonificação) — o shape real é CapabilityRecommendation[].
    () =>
      raw && typeof raw === "object"
        ? (raw.data as CapabilitiesEnvelope)
        : undefined,
    [raw],
  )
  return { data, refetch: () => void refetchRef.current?.() }
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
  /** Ação curta (ex.: "Abrir", "Revisar", "Ativar"). */
  action?: { label: string; onClick: () => void }
}

export function CapabilityRow({
  icon,
  title,
  summary,
  tokens,
  status,
  badge,
  action,
}: CapabilityRowProps) {
  const sideBtn =
    "flex min-h-8 shrink-0 items-center justify-center rounded-md border px-2.5 text-[12px] font-medium transition-colors"
  return (
    <div
      className="rounded-lg border"
      style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
    >
      <div className="flex items-start gap-3 p-3">
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
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
        {action ? (
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
    </div>
  )
}
