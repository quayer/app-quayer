"use client"

/**
 * EmptyState — base reutilizável do DS para estados vazios.
 *
 * Unifica os 3 empty-states que existiam duplicados:
 *   - custom/empty-state.tsx (lista de canais / home)          → variant "card"
 *   - projetos/preview/tabs/overview/components/empty-state    → variant "plain"
 *   - projetos/preview/tabs/prompt/prompt-empty-state          → variant "plain"
 *
 * Variantes (visual preservado dos originais):
 *   - "card"  — caixa com borda (bgSurface/border), ícone em círculo
 *               (bgElevated/brand), título text-sm font-medium, descrição
 *               text-xs textTertiary.
 *   - "plain" — sem borda, ícone em rounded-2xl (brandSubtle/brand), título
 *               text-sm font-semibold, descrição text-[13px] textSecondary.
 *
 * `tokens` é opcional: quem já tem os tokens (preview tabs) passa via prop;
 * caso contrário o componente resolve via useAppTokens().
 */

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useAppTokens, type AppTokens } from "@/client/hooks/use-app-tokens"

interface EmptyStateProps {
  icon: ReactNode
  title?: ReactNode
  description?: ReactNode
  /** Nó extra renderizado após a descrição (botão/link de ação). */
  action?: ReactNode
  variant?: "card" | "plain"
  /** Classes extras no container (ex.: "py-6", "min-h-[280px] justify-center"). */
  className?: string
  /** Classes extras no <p> da descrição (ex.: "max-w-xs"). */
  descriptionClassName?: string
  /** Tokens DS já resolvidos pelo caller; default: useAppTokens(). */
  tokens?: AppTokens
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "card",
  className,
  descriptionClassName,
  tokens: tokensProp,
}: EmptyStateProps) {
  const { tokens: hookTokens } = useAppTokens()
  const tokens = tokensProp ?? hookTokens
  const isCard = variant === "card"

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 text-center",
        isCard && "mx-auto w-full max-w-md rounded-xl border p-10",
        className,
      )}
      style={
        isCard
          ? { backgroundColor: tokens.bgSurface, borderColor: tokens.border }
          : undefined
      }
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center",
          isCard ? "rounded-full" : "rounded-2xl",
        )}
        style={{
          backgroundColor: isCard ? tokens.bgElevated : tokens.brandSubtle,
          color: tokens.brand,
        }}
      >
        {icon}
      </div>
      {title != null && (
        <h3
          className={cn("text-sm", isCard ? "font-medium" : "font-semibold")}
          style={{ color: tokens.textPrimary }}
        >
          {title}
        </h3>
      )}
      {description != null && (
        <p
          className={cn(
            isCard ? "max-w-xs text-xs" : "text-[13px]",
            descriptionClassName,
          )}
          style={{
            color: isCard ? tokens.textTertiary : tokens.textSecondary,
          }}
        >
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
