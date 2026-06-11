/**
 * Shared types for the Overview tab feature.
 */

import type { PreviewTab } from "@/client/components/projetos/types"

export type StageStatus = "done" | "active" | "pending"

export interface Stage {
  number: number
  title: string
  status: StageStatus
  detail?: string
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
