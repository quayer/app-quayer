"use client"

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

export interface CapabilityToggleRowProps {
  icon: React.ReactNode
  title: string
  summary: string
  tokens: AppTokens
  status: { label: string; active: boolean }
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  badge?: string
  action?: { label: string; onClick: () => void }
  disabled?: boolean
  busy?: boolean
  children?: React.ReactNode
}

export function CapabilityToggleRow({
  icon,
  title,
  summary,
  tokens,
  status,
  checked,
  onCheckedChange,
  badge,
  action,
  disabled = false,
  busy = false,
  children,
}: CapabilityToggleRowProps) {
  const switchDisabled = disabled || busy
  const sideBtn =
    "flex min-h-8 shrink-0 items-center justify-center rounded-md border px-2.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"

  return (
    <div
      className="rounded-lg border"
      style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
    >
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{
              backgroundColor: status.active
                ? tokens.brandSubtle
                : tokens.hoverBg,
              color: status.active ? tokens.brand : tokens.textTertiary,
            }}
            aria-hidden="true"
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-[13px] font-semibold"
                style={{ color: tokens.textPrimary }}
              >
                {title}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: status.active
                    ? tokens.successSubtle
                    : tokens.hoverBg,
                  color: status.active ? tokens.successText : tokens.textTertiary,
                }}
              >
                {busy ? "Salvando..." : status.label}
              </span>
              {badge && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: tokens.brandSubtle,
                    color: tokens.brand,
                  }}
                >
                  {badge}
                </span>
              )}
            </div>
            <p
              className="mt-1 text-[12px] leading-relaxed"
              style={{ color: tokens.textSecondary }}
            >
              {summary}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              disabled={busy}
              className={sideBtn}
              style={{
                borderColor: tokens.divider,
                color: tokens.textSecondary,
                backgroundColor: tokens.bgBase,
              }}
            >
              {action.label}
            </button>
          ) : null}

          <button
            type="button"
            role="switch"
            aria-label={`${checked ? "Desligar" : "Ligar"} ${title}`}
            aria-checked={checked}
            disabled={switchDisabled}
            onClick={() => onCheckedChange(!checked)}
            className="relative h-6 w-10 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: checked ? tokens.brand : tokens.divider,
              backgroundColor: checked ? tokens.brand : tokens.hoverBg,
            }}
          >
            <span
              className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full shadow-sm transition-transform"
              style={{
                left: checked ? "calc(100% - 1.25rem)" : "0.1875rem",
                backgroundColor: tokens.bgSurface,
              }}
            />
          </button>
        </div>
      </div>

      {children ? (
        <div
          className="border-t px-3 pb-3 pt-3"
          style={{ borderColor: tokens.divider }}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
