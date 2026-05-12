"use client"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

export const ROLE_LABELS: Record<string, string> = {
  master: "Master",
  manager: "Manager",
  user: "Usuário",
  admin: "Admin",
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role
}

export function timeAgo(iso: string): string {
  const target = new Date(iso).getTime()
  const diff = target - Date.now()
  const future = diff > 0
  const abs = Math.abs(diff)
  const minutes = Math.round(abs / 60_000)
  if (minutes < 60) return future ? `expira em ${minutes}min` : `há ${minutes}min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return future ? `expira em ${hours}h` : `há ${hours}h`
  const days = Math.round(hours / 24)
  return future ? `expira em ${days}d` : `há ${days}d`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export type PillTone = "brand" | "neutral" | "success" | "muted"

export function Pill({
  children,
  tokens,
  tone = "neutral",
}: {
  children: React.ReactNode
  tokens: AppTokens
  tone?: PillTone
}) {
  const palette = (() => {
    if (tone === "brand" || tone === "success") {
      return { bg: tokens.brandSubtle, color: tokens.brand, border: tokens.brandBorder }
    }
    if (tone === "muted") {
      return { bg: tokens.bgElevated, color: tokens.textTertiary, border: tokens.divider }
    }
    return { bg: tokens.bgElevated, color: tokens.textSecondary, border: tokens.divider }
  })()
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: palette.bg,
        color: palette.color,
        borderColor: palette.border,
      }}
    >
      {children}
    </span>
  )
}

export function SectionCard({
  title,
  count,
  tokens,
  children,
}: {
  title: string
  count: number
  tokens: AppTokens
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl border p-6"
      style={{ backgroundColor: tokens.bgSurface, borderColor: tokens.border }}
    >
      <div className="mb-4 flex items-center gap-2">
        <h2
          className="text-[14px] font-semibold"
          style={{ color: tokens.textPrimary }}
        >
          {title}
        </h2>
        <span
          className="text-[11px] font-medium tabular-nums"
          style={{ color: tokens.textTertiary }}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  )
}
