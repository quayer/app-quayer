"use client"

import Link from "next/link"
import { Check, X } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { PreviewTab } from "@/client/components/projetos/types"
import type { ReadinessItem } from "../types"

export function ReadinessRow({
  item,
  tokens,
  onTabChange,
}: {
  item: ReadinessItem
  tokens: AppTokens
  /** Navegação interna do workspace para blockers resolvíveis em outra tab. */
  onTabChange?: (tab: PreviewTab) => void
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: item.met ? tokens.successSubtle : tokens.dangerSubtle,
        }}
      >
        {item.met ? (
          <Check className="h-3 w-3" style={{ color: tokens.success }} aria-hidden="true" />
        ) : (
          <X className="h-3 w-3" style={{ color: tokens.danger }} aria-hidden="true" />
        )}
      </div>
      <div className="flex min-w-0 flex-col">
        <span
          className="text-[13px]"
          style={{
            color: item.met ? tokens.textPrimary : tokens.textSecondary,
          }}
        >
          {item.label}
          <span className="sr-only">{item.met ? " — atendido" : " — pendente"}</span>
        </span>
        {!item.met && item.detail && (
          <ActionableDetail item={item} tokens={tokens} onTabChange={onTabChange} />
        )}
      </div>
    </div>
  )
}

/**
 * Detalhe do blocker como AÇÃO, não texto morto: vira Link quando o fix mora
 * fora do workspace (`redirect`) ou botão de navegação interna (`tab`).
 */
function ActionableDetail({
  item,
  tokens,
  onTabChange,
}: {
  item: ReadinessItem
  tokens: AppTokens
  onTabChange?: (tab: PreviewTab) => void
}) {
  const detail = item.detail ?? ""

  if (item.redirect) {
    return (
      <Link
        href={item.redirect}
        className="text-[11px] leading-snug underline underline-offset-2"
        style={{ color: tokens.brandText }}
      >
        {detail} →
      </Link>
    )
  }

  if (item.tab && onTabChange) {
    const tab = item.tab
    return (
      <button
        type="button"
        onClick={() => onTabChange(tab)}
        className="w-fit text-left text-[11px] leading-snug underline underline-offset-2"
        style={{ color: tokens.brandText }}
      >
        {detail} →
      </button>
    )
  }

  return (
    <span
      className="text-[11px] leading-snug"
      style={{ color: tokens.textTertiary }}
    >
      {detail}
    </span>
  )
}
