"use client"

import { useAppTokens } from "@/client/hooks/use-app-tokens"

interface UsageMeterProps {
  label: string
  unit: string
  current: number
  max: number
}

/**
 * UsageMeter — surface card showing X/Y consumption of a quota
 * with a traffic-light colored progress bar.
 *
 * - <80%   → green
 * - 80-95% → amber
 * - >=95%  → red
 *
 * The bar uses inline rgba so the traffic-light states stay
 * consistent across light/dark themes without polluting tokens.
 */
export function UsageMeter({ label, unit, current, max }: UsageMeterProps) {
  const { tokens } = useAppTokens()

  const safeMax = Math.max(max, 1)
  const pct = Math.min(100, Math.round((current / safeMax) * 100))

  const state: "ok" | "warn" | "danger" =
    pct >= 95 ? "danger" : pct >= 80 ? "warn" : "ok"

  const barColor =
    state === "danger"
      ? "rgb(239 68 68)" // red-500
      : state === "warn"
        ? "rgb(245 158 11)" // amber-500
        : "rgb(34 197 94)" // green-500

  const stateLabel =
    state === "danger"
      ? "Limite quase atingido"
      : state === "warn"
        ? "Uso elevado"
        : "Dentro do plano"

  return (
    <div
      className="rounded-2xl border p-6"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: tokens.textSecondary }}
          >
            {label}
          </p>
          <p
            className="mt-2 text-2xl font-semibold tracking-tight"
            style={{ color: tokens.textPrimary }}
          >
            <span>{current}</span>
            <span
              className="mx-1 text-base font-normal"
              style={{ color: tokens.textTertiary }}
            >
              /
            </span>
            <span style={{ color: tokens.textSecondary }}>{max}</span>
            <span
              className="ml-2 text-sm font-normal"
              style={{ color: tokens.textTertiary }}
            >
              {unit}
            </span>
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{
            backgroundColor: `${barColor}1A`,
            color: barColor,
          }}
        >
          {pct}%
        </span>
      </div>

      <div
        className="mt-4 h-2 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: tokens.bgElevated }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${current} de ${max} ${unit}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>

      <p
        className="mt-3 text-xs"
        style={{ color: tokens.textTertiary }}
      >
        {stateLabel}
      </p>
    </div>
  )
}
