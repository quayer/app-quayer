/**
 * Shared types for the Overview tab feature.
 */

import type { PreviewTab } from "@/client/components/projetos/types"
import type { PhaseId } from "@/server/ai-module/builder/state/readiness.types"

export type StageStatus = "done" | "active" | "pending"

export interface Stage {
  number: number
  title: string
  status: StageStatus
  detail?: string
}

/**
 * Uma fase da Journey v2 ("Configure por exceção") já adaptada para render —
 * título + status da fase + os steps daquela fase como linhas do StageList.
 * Presente só em projetos `journeyVersion: 2` (ver `journeyToPhases`).
 */
export interface JourneyPhaseView {
  id: PhaseId
  title: string
  status: StageStatus
  stages: Stage[]
}

export interface ReadinessItem {
  label: string
  met: boolean
  /** CTA/mensagem do blocker real (só presente quando `met === false`). */
  detail?: string
  /** Rota externa ao workspace para resolver o blocker (ex.: "/conta"). */
  redirect?: string
  /** Tab do workspace que resolve o blocker (ex.: "deploy"). */
  tab?: PreviewTab
}
