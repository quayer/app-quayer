"use client"

import * as React from "react"
import { Check } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import type { BuilderStage } from "../cards/progress-card"

const STAGES: Array<{ key: BuilderStage; label: string }> = [
  { key: "name", label: "Nome" },
  { key: "goal", label: "Objetivo" },
  { key: "prompt", label: "Prompt" },
  { key: "tools", label: "Tools" },
  { key: "tests", label: "Testes" },
  { key: "channel", label: "Canal" },
  { key: "deploy", label: "Deploy" },
]

interface BuilderStageStripProps {
  currentStage: BuilderStage
  tokens: AppTokens
}

/**
 * Compact horizontal stage strip shown at the top of the chat scroll
 * area. Unlike ProgressCard (vertical stepper, dense), this is meant to
 * sit as a narrow header — always visible, low visual weight.
 *
 * Dots instead of numbered steps: we optimize for quick glanceability,
 * not for a user who needs to count "which step am I on".
 */
export function BuilderStageStrip({
  currentStage,
  tokens,
}: BuilderStageStripProps) {
  const currentIndex = STAGES.findIndex((s) => s.key === currentStage)
  if (currentIndex < 0) return null

  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-2 backdrop-blur"
      style={{
        backgroundColor: `${tokens.bgBase}cc`,
        borderColor: tokens.divider,
      }}
    >
      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: tokens.textTertiary }}
      >
        Progresso
      </span>
      <div className="flex items-center gap-1 overflow-x-auto">
        {STAGES.map((stage, i) => {
          const done = i < currentIndex
          const current = i === currentIndex
          const pending = i > currentIndex

          return (
            <React.Fragment key={stage.key}>
              <div
                className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5"
                style={{
                  backgroundColor: current
                    ? tokens.brandSubtle
                    : "transparent",
                }}
                aria-current={current ? "step" : undefined}
              >
                <StageDot
                  status={done ? "done" : current ? "current" : "pending"}
                  tokens={tokens}
                />
                <span
                  className="text-[11px] font-medium"
                  style={{
                    color: current
                      ? tokens.brandText
                      : done
                        ? tokens.textSecondary
                        : tokens.textTertiary,
                  }}
                >
                  {stage.label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div
                  className="h-px w-3 shrink-0"
                  style={{
                    backgroundColor: pending
                      ? tokens.divider
                      : tokens.brand,
                  }}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

function StageDot({
  status,
  tokens,
}: {
  status: "done" | "current" | "pending"
  tokens: AppTokens
}) {
  if (status === "done") {
    return (
      <div
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: tokens.brand, color: tokens.textInverse }}
      >
        <Check className="h-2 w-2" strokeWidth={3} />
      </div>
    )
  }
  if (status === "current") {
    return (
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{
          backgroundColor: tokens.brand,
          boxShadow: `0 0 0 3px ${tokens.brandSubtle}`,
        }}
      />
    )
  }
  return (
    <div
      className="h-2.5 w-2.5 shrink-0 rounded-full border"
      style={{ borderColor: tokens.divider }}
    />
  )
}
