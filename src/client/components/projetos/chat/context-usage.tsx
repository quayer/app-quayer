"use client"

import * as React from "react"
import { Activity } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

import type { ChatMessage } from "../types"

/**
 * Mirrors the backend heuristic in
 * `src/server/ai-module/builder/services/context-budget.service.ts`:
 *   estimateTokens(text) = Math.ceil(text.length / 4)
 *
 * Keep in sync with DEFAULT_THRESHOLD (128_000 tokens = ~80% of ~160k ctx).
 */
const DEFAULT_THRESHOLD = 128_000

/** Critical red — matches the `isListening` indicator in `chat-input.tsx`. */
const CRITICAL_RED = "#ef4444"

/** Zone boundaries (percent of threshold). */
const ZONE_ATTENTION_AT = 60
const ZONE_CRITICAL_AT = 85

export interface ContextUsageProps {
  messages: ChatMessage[]
  /** Opcional — override do threshold. Default 128_000 (match backend). */
  threshold?: number
  /** 'compact' = barra fina só; 'full' = barra + label textual. */
  variant?: "compact" | "full"
}

function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

function stringifySafe(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return ""
  }
}

function computeMessageTokens(message: ChatMessage): number {
  let total = estimateTokens(message.content)
  if (message.toolCalls && message.toolCalls.length > 0) {
    for (const tc of message.toolCalls) {
      total += estimateTokens(stringifySafe(tc.args))
      if (tc.result !== undefined) {
        total += estimateTokens(stringifySafe(tc.result))
      }
    }
  }
  return total
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  const k = n / 1000
  // one decimal under 100k, zero decimals above
  return k < 100 ? `${k.toFixed(1)}k` : `${Math.round(k)}k`
}

export function ContextUsage({
  messages,
  threshold = DEFAULT_THRESHOLD,
  variant = "compact",
}: ContextUsageProps): React.ReactElement | null {
  const { tokens } = useAppTokens()

  const { totalTokens, pct } = React.useMemo(() => {
    const total = messages.reduce(
      (acc, m) => acc + computeMessageTokens(m),
      0,
    )
    const rawPct = (total / threshold) * 100
    const clamped = Math.min(100, Math.max(0, rawPct))
    return { totalTokens: total, pct: clamped }
  }, [messages, threshold])

  if (messages.length === 0) return null

  const isAttention = pct >= ZONE_ATTENTION_AT && pct < ZONE_CRITICAL_AT
  const isCritical = pct >= ZONE_CRITICAL_AT

  const zoneColor = isCritical
    ? CRITICAL_RED
    : isAttention
      ? tokens.brand
      : tokens.textTertiary

  const roundedPct = Math.round(pct)
  const tooltipLabel = `${formatTokens(totalTokens)} / ${formatTokens(
    threshold,
  )} tokens - ${roundedPct}% usado`

  const bar = (
    <div
      role="progressbar"
      aria-valuenow={roundedPct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={tooltipLabel}
      className={isCritical ? "animate-pulse" : undefined}
      style={{
        width: 200,
        maxWidth: "100%",
        height: 2,
        borderRadius: 999,
        backgroundColor: tokens.border,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          backgroundColor: zoneColor,
          transition: "width 200ms ease-out, background-color 200ms ease-out",
        }}
      />
    </div>
  )

  if (variant === "full") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={isCritical ? "animate-pulse" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: zoneColor,
            }}
          >
            <Activity size={12} aria-hidden="true" />
            {bar}
            <span
              className="text-[11px]"
              style={{ color: zoneColor, whiteSpace: "nowrap" }}
            >
              {roundedPct}% do contexto
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {bar}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
    </Tooltip>
  )
}
