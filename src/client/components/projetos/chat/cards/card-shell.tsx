"use client"

/**
 * Builder Cards — Shared presentational shell (Orayon Uplift, W3)
 *
 * Extracts the card chrome shared by every Builder card so each W3 card only
 * supplies its body + footer actions. The styling idiom is lifted verbatim from
 * the existing `ToolSelectionCard` / `ChannelSelectionCard` in chat-panel.tsx:
 *   - container: `max-w-[95%] rounded-lg border p-4` on bgSurface/divider
 *   - header:    `h-9 w-9` rounded brand-subtle icon tile + title + optional
 *                reason line (13px semibold / 13px secondary)
 *   - footer:    `mt-4 flex flex-wrap gap-2` action row (primary + secondary)
 *
 * Purely presentational + token-driven (useAppTokens). No fetching, no state.
 */

import type { ReactNode } from "react"

import { Button } from "@/client/components/ui/button"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

/** A footer button descriptor — keeps cards from re-deriving button styling. */
export interface CardShellAction {
  label: string
  onClick: () => void
  /** Primary = solid brand button; secondary/ghost = outline. Default primary. */
  variant?: "primary" | "secondary"
  /** Optional leading icon node (e.g. <Check className="h-3.5 w-3.5" />). */
  icon?: ReactNode
  disabled?: boolean
  /** Native button type — defaults to "button" (cards never submit a form). */
  type?: "button" | "submit"
}

export interface CardShellProps {
  /** Header icon node (a lucide icon element), e.g. <Sparkles className="h-4 w-4" />. */
  icon: ReactNode
  /** Header title (13px semibold, textPrimary). */
  title: string
  /** Optional sub-line under the title (the card's "reason"/explanation). */
  reason?: ReactNode
  /** Card body — the card's own fields/inputs. */
  children?: ReactNode
  /**
   * Footer action buttons. Rendered left-to-right in a wrapping row. Pass [] or
   * omit for a card that has no footer (e.g. a read-only/poll card).
   */
  actions?: CardShellAction[]
  tokens: AppTokens
  /** Optional extra classes on the outer container. */
  className?: string
}

/**
 * CardShell — the chrome for a Builder card: icon + title + reason header, a
 * body slot, and an optional footer action row. Match this shell from every W3
 * card so the catalog stays visually consistent.
 */
export function CardShell({
  icon,
  title,
  reason,
  children,
  actions,
  tokens,
  className,
}: CardShellProps) {
  return (
    <div
      className={`max-w-[95%] rounded-lg border p-4${className ? ` ${className}` : ""}`}
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[13px] font-semibold"
            style={{ color: tokens.textPrimary }}
          >
            {title}
          </p>
          {reason != null && (
            <p
              className="mt-1 text-[13px] leading-relaxed"
              style={{ color: tokens.textSecondary }}
            >
              {reason}
            </p>
          )}
        </div>
      </div>

      {children != null && <div className="mt-4">{children}</div>}

      {actions && actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              type={action.type ?? "button"}
              size="sm"
              variant={action.variant === "secondary" ? "outline" : "default"}
              className="h-8 gap-1.5 text-[12px]"
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
