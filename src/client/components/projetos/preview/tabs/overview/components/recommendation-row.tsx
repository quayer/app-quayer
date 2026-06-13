"use client"

/**
 * Overview — uma linha de CAPACIDADE RECOMENDADA (FR-51/FR-52, T113).
 *
 * Renderiza UMA sugestão do recomendador puro (`recommendAgentCapabilities`):
 *   - recomendada → badge "Sugerido para seu nicho"; opcional → sem badge.
 *   - `reason` em linguagem de negócio (FR-49) como descrição.
 *   - `risk` (quando houver) em destaque de alerta (ex.: agenda sem conexão, FR-11).
 *
 * 🔒 FR-09: esta linha NUNCA tem toggle nem grava `enabledTools`. O CTA "Configurar"
 * só REABRE o card de domínio (via `onConfigure`); sugestões sem card próprio
 * (create_lead/create_followup/calculator) ficam informativas, sem CTA. Aceitar é
 * sempre uma decisão tomada no card de domínio — nunca uma segunda superfície aqui.
 */

import * as React from "react"
import { Sparkles } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { CapabilityRecommendation } from "@/server/ai-module/builder/capabilities/recommend-capabilities.pure"

export interface RecommendationRowProps {
  recommendation: CapabilityRecommendation
  tokens: AppTokens
  /** Reabre o card de domínio. Ausente = sugestão sem card próprio (sem CTA). */
  onConfigure?: () => void
}

export function RecommendationRow({
  recommendation,
  tokens,
  onConfigure,
}: RecommendationRowProps) {
  const { kind, reason, risk } = recommendation
  const recommended = kind === "recommended"
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
            backgroundColor: recommended ? tokens.brandSubtle : tokens.hoverBg,
            color: recommended ? tokens.brand : tokens.textTertiary,
          }}
          aria-hidden="true"
        >
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {recommended ? (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}
              >
                Sugerido para seu nicho
              </span>
            ) : (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: tokens.hoverBg, color: tokens.textTertiary }}
              >
                Opcional
              </span>
            )}
          </div>
          <p
            className="mt-1 text-[12px] leading-relaxed"
            style={{ color: tokens.textSecondary }}
          >
            {reason}
          </p>
          {risk ? (
            <p
              className="mt-1.5 text-[11px] leading-relaxed"
              style={{ color: tokens.warningText }}
            >
              {risk}
            </p>
          ) : null}
        </div>
        {onConfigure ? (
          <button
            type="button"
            onClick={onConfigure}
            className={sideBtn}
            style={{
              borderColor: tokens.divider,
              color: tokens.textSecondary,
              backgroundColor: tokens.bgBase,
            }}
          >
            Configurar
          </button>
        ) : null}
      </div>
    </div>
  )
}
