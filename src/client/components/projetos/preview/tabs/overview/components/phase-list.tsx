"use client"

/**
 * PhaseList — render por FASES da Journey v2 ("Configure por exceção").
 *
 * Só é montado quando `readiness.journey` existe (projetos `journeyVersion: 2`,
 * adaptado por `journeyToPhases`). Em v1 a Overview mantém o `StageList` plano,
 * render byte-idêntico ao atual (NFR-03). Cada fase é um cabeçalho ("Fase 2
 * de 4 — Revisar", com status) seguido dos seus steps reusando o MESMO
 * `StageList`/`StageRow` da jornada v1 — zero componente de linha duplicado.
 */

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { JourneyPhaseView } from "../types"
import { StageList } from "./stage-list"

const PHASE_STATUS_LABEL: Record<JourneyPhaseView["status"], string> = {
  done: "Concluída",
  active: "Em progresso",
  pending: "Pendente",
}

export function PhaseList({
  phases,
  tokens,
}: {
  phases: JourneyPhaseView[]
  tokens: AppTokens
}) {
  const total = phases.length

  return (
    <div className="flex flex-col gap-4">
      {phases.map((phase, index) => {
        const isActive = phase.status === "active"
        const isDone = phase.status === "done"
        const statusColor = isDone
          ? tokens.successText
          : isActive
            ? tokens.brand
            : tokens.textDisabled
        return (
          <div key={phase.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{
                  color: isDone || isActive ? tokens.textSecondary : tokens.textTertiary,
                }}
              >
                Fase {index + 1} de {total} — {phase.title}
              </span>
              <span
                className="text-[11px] font-medium"
                style={{ color: statusColor }}
              >
                {PHASE_STATUS_LABEL[phase.status]}
              </span>
            </div>
            <StageList stages={phase.stages} tokens={tokens} />
          </div>
        )
      })}
    </div>
  )
}
