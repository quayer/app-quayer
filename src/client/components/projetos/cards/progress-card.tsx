"use client"

import * as React from "react"
import { Check, Circle, Loader2 } from "lucide-react"

import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { BuilderStageKey } from "@/client/components/projetos/chat/hooks/builder-stage-defs"

export type BuilderStage = BuilderStageKey

type StageStatus = "done" | "current" | "pending"

const STAGES: Array<{ key: BuilderStage; label: string }> = [
  { key: "name", label: "Nome do agente" },
  { key: "goal", label: "Objetivo" },
  { key: "prompt", label: "Prompt do sistema" },
  { key: "tools", label: "Ferramentas" },
  { key: "tests", label: "Testes" },
  { key: "channel", label: "Canal WhatsApp" },
  { key: "deploy", label: "Deploy" },
]

interface ProgressCardProps {
  currentStage: BuilderStage
  tokens: AppTokens
}

/**
 * ProgressCard — vertical stepper showing the 7 Builder stages.
 */
export function ProgressCard({ currentStage, tokens }: ProgressCardProps) {
  const currentIndex = STAGES.findIndex((s) => s.key === currentStage)

  function getStatus(index: number): StageStatus {
    if (index < currentIndex) return "done"
    if (index === currentIndex) return "current"
    return "pending"
  }

  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
        borderRadius: "16px",
      }}
    >
      <CardContent className="px-4 py-3">
        <p
          className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: tokens.textTertiary }}
        >
          Progresso do Builder
        </p>
        <div className="flex flex-col">
          {STAGES.map((stage, index) => {
            const status = getStatus(index)
            const isLast = index === STAGES.length - 1
            return (
              <div key={stage.key} className="flex gap-3">
                {/* Indicator column */}
                <div className="flex flex-col items-center">
                  <StepIndicator
                    status={status}
                    tokens={tokens}
                  />
                  {!isLast && (
                    <div
                      className="w-px flex-1"
                      style={{
                        minHeight: "16px",
                        backgroundColor:
                          status === "done"
                            ? tokens.brand
                            : tokens.divider,
                      }}
                    />
                  )}
                </div>
                {/* Label */}
                <div className="pb-3">
                  <p
                    className="text-[13px] font-medium leading-5"
                    style={{
                      color:
                        status === "current"
                          ? tokens.brandText
                          : status === "done"
                            ? tokens.textPrimary
                            : tokens.textTertiary,
                    }}
                  >
                    {stage.label}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function StepIndicator({
  status,
  tokens,
}: {
  status: StageStatus
  tokens: AppTokens
}) {
  if (status === "done") {
    return (
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: tokens.brand,
          color: tokens.textInverse,
        }}
      >
        <Check className="h-3 w-3" strokeWidth={2.5} />
      </div>
    )
  }

  if (status === "current") {
    return (
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: tokens.brandSubtle,
          border: `2px solid ${tokens.brand}`,
        }}
      >
        <Loader2
          className="h-2.5 w-2.5 animate-spin"
          style={{ color: tokens.brand }}
        />
      </div>
    )
  }

  return (
    <div
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
      style={{ borderColor: tokens.divider }}
    >
      <Circle
        className="h-2 w-2"
        style={{ color: tokens.textDisabled }}
        fill="currentColor"
      />
    </div>
  )
}
