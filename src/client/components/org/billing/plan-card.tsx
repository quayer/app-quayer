"use client"

import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { Button } from "@/client/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/client/components/ui/tooltip"

export type PlanTier = "free" | "basic" | "pro"

interface PlanCardProps {
  tier: PlanTier
  label: string
  description: string
}

interface BadgeStyle {
  bg: string
  border: string
  text: string
}

/**
 * PlanCard — top hero card for /org/billing showing the current
 * plan tier and a placeholder upgrade CTA (tooltip "Em breve").
 */
export function PlanCard({ tier, label, description }: PlanCardProps) {
  const { tokens } = useAppTokens()

  const badge: BadgeStyle =
    tier === "pro"
      ? {
          bg: tokens.brandSubtle,
          border: tokens.brandBorder,
          text: tokens.brandText,
        }
      : tier === "basic"
        ? {
            // Blue tone for "Basic" — themed via rgba so it works in light + dark.
            bg: "rgba(59, 130, 246, 0.12)",
            border: "rgba(59, 130, 246, 0.35)",
            text: "rgb(59, 130, 246)",
          }
        : {
            bg: tokens.bgElevated,
            border: tokens.border,
            text: tokens.textSecondary,
          }

  return (
    <section
      className="rounded-2xl border p-6"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
      }}
      aria-labelledby="plan-card-title"
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span
            className="inline-flex h-7 items-center rounded-full border px-3 text-[11px] font-semibold uppercase tracking-wide"
            style={{
              backgroundColor: badge.bg,
              borderColor: badge.border,
              color: badge.text,
            }}
          >
            {label}
          </span>
          <div className="min-w-0">
            <h2
              id="plan-card-title"
              className="text-lg font-semibold tracking-tight"
              style={{ color: tokens.textPrimary }}
            >
              Plano {label.toUpperCase()}
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: tokens.textSecondary }}
            >
              {description}
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/*
                  Disabled buttons don't fire pointer events in Radix,
                  so we wrap in a span to keep the tooltip working.
                */}
                <span tabIndex={0} className="inline-block">
                  <Button
                    type="button"
                    disabled
                    aria-disabled
                    className="cursor-not-allowed"
                  >
                    Fazer upgrade
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Em breve</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </section>
  )
}
