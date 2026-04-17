/**
 * Shared types for the Overview tab feature.
 */

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
}
