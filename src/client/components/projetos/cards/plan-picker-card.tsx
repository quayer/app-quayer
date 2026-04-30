"use client"

import * as React from "react"
import { ArrowRight, Check, Sparkles } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

export interface PlanSummary {
  id: string
  slug: string
  name: string
  description: string | null
  priceMonthlyCents: number
  priceYearlyCents: number | null
  currency: string
  isFree: boolean
  limits: {
    instances: number
    messages: number
    aiCredits: number
    contacts: number
    users: number
  }
  features: {
    webhooks: boolean
    api: boolean
    customRoles: boolean
    sso: boolean
    aiAgents: boolean
    prioritySupport: boolean
  }
  isCurrent: boolean
  relativeTier: "downgrade" | "same" | "upgrade" | "unknown"
}

interface PlanPickerCardProps {
  plans: PlanSummary[]
  tokens: AppTokens
  /** Slug of plan to pre-highlight (e.g. the next upgrade tier) */
  highlight?: string | null
  reason?: string | null
  /** Called with the chosen plan slug when user clicks "Escolher" */
  onChoose?: (slug: string) => void
  disabled?: boolean
}

function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return "Grátis"
  const units = cents / 100
  const symbol =
    currency === "BRL" ? "R$ " : currency === "USD" ? "US$ " : `${currency} `
  return `${symbol}${units.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatLimit(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return n.toLocaleString("pt-BR")
}

const FEATURE_LABELS: Array<{
  key: keyof PlanSummary["features"]
  label: string
}> = [
  { key: "aiAgents", label: "Agentes de IA" },
  { key: "webhooks", label: "Webhooks" },
  { key: "api", label: "API pública" },
  { key: "customRoles", label: "Papéis customizados" },
  { key: "sso", label: "SSO corporativo" },
  { key: "prioritySupport", label: "Suporte prioritário" },
]

/**
 * PlanPickerCard — horizontal strip of plan cards showing price, limits,
 * and feature flags. The `highlight` slug gets a glowing border and
 * "Recomendado" ribbon.
 */
export function PlanPickerCard({
  plans,
  tokens,
  highlight,
  reason,
  onChoose,
  disabled = false,
}: PlanPickerCardProps) {
  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
        borderRadius: "16px",
      }}
    >
      <CardContent className="p-0">
        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ backgroundColor: tokens.hoverBg }}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: tokens.brandSubtle,
              color: tokens.brand,
            }}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[13px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              Planos disponíveis
            </p>
            <p
              className="truncate text-[11px]"
              style={{ color: tokens.textTertiary }}
            >
              {reason ?? "Compare as opções e escolha a que melhor encaixa"}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-3 py-3 md:flex-row md:flex-wrap">
          {plans.map((plan) => {
            const isHighlighted = highlight === plan.slug
            const isCurrent = plan.isCurrent
            const canChoose =
              !disabled && !isCurrent && plan.relativeTier !== "downgrade"

            return (
              <div
                key={plan.id}
                className="relative flex min-w-0 flex-1 flex-col gap-3 rounded-xl border p-3 md:min-w-[180px]"
                style={{
                  borderColor: isHighlighted
                    ? tokens.brand
                    : tokens.border,
                  backgroundColor: isHighlighted
                    ? tokens.brandSubtle
                    : "transparent",
                  boxShadow: isHighlighted
                    ? `0 0 0 2px ${tokens.brandSubtle}`
                    : "none",
                }}
              >
                {isHighlighted && (
                  <span
                    className="absolute -top-2 left-3 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{
                      backgroundColor: tokens.brand,
                      color: tokens.textInverse,
                    }}
                  >
                    Recomendado
                  </span>
                )}
                {isCurrent && (
                  <span
                    className="absolute -top-2 right-3 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{
                      backgroundColor: tokens.hoverBg,
                      color: tokens.textTertiary,
                    }}
                  >
                    Atual
                  </span>
                )}

                <div>
                  <p
                    className="text-[13px] font-semibold"
                    style={{ color: tokens.textPrimary }}
                  >
                    {plan.name}
                  </p>
                  {plan.description && (
                    <p
                      className="mt-0.5 line-clamp-2 text-[10px]"
                      style={{ color: tokens.textTertiary }}
                    >
                      {plan.description}
                    </p>
                  )}
                </div>

                <div>
                  <p
                    className="text-[18px] font-bold leading-none"
                    style={{ color: tokens.textPrimary }}
                  >
                    {formatPrice(plan.priceMonthlyCents, plan.currency)}
                  </p>
                  {!plan.isFree && (
                    <p
                      className="text-[10px]"
                      style={{ color: tokens.textTertiary }}
                    >
                      /mês
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <div
                    className="text-[10px]"
                    style={{ color: tokens.textSecondary }}
                  >
                    <span className="font-semibold">
                      {formatLimit(plan.limits.messages)}
                    </span>{" "}
                    mensagens/mês
                  </div>
                  <div
                    className="text-[10px]"
                    style={{ color: tokens.textSecondary }}
                  >
                    <span className="font-semibold">
                      {formatLimit(plan.limits.instances)}
                    </span>{" "}
                    conexões WhatsApp
                  </div>
                  <div
                    className="text-[10px]"
                    style={{ color: tokens.textSecondary }}
                  >
                    <span className="font-semibold">
                      {formatLimit(plan.limits.contacts)}
                    </span>{" "}
                    contatos
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  {FEATURE_LABELS.filter((f) => plan.features[f.key]).map(
                    (f) => (
                      <div
                        key={f.key}
                        className="flex items-center gap-1.5 text-[10px]"
                        style={{ color: tokens.textSecondary }}
                      >
                        <Check
                          className="h-3 w-3 shrink-0"
                          style={{ color: tokens.brand }}
                        />
                        {f.label}
                      </div>
                    ),
                  )}
                </div>

                <Button
                  size="sm"
                  variant={isHighlighted ? "default" : "outline"}
                  className="mt-auto h-8 w-full gap-1 rounded-lg text-[12px] font-medium"
                  style={
                    isHighlighted
                      ? {
                          backgroundColor: tokens.brand,
                          color: tokens.textInverse,
                        }
                      : undefined
                  }
                  onClick={() => canChoose && onChoose?.(plan.slug)}
                  disabled={!canChoose}
                >
                  {isCurrent
                    ? "Plano atual"
                    : plan.relativeTier === "downgrade"
                      ? "Downgrade"
                      : "Escolher"}
                  {canChoose && <ArrowRight className="h-3 w-3" />}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
