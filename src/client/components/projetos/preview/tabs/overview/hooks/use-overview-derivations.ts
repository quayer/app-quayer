import { useMemo } from "react"
import type {
  ChatMessage,
  WorkspaceProject,
} from "@/client/components/projetos/types"
import type { Stage, ReadinessItem } from "../types"
import { deriveStagesFromMessages } from "../helpers/derive-stages"
import { deriveReadiness } from "../helpers/derive-readiness"

interface OverviewDerivations {
  stages: Stage[]
  readiness: ReadinessItem[]
  readinessMet: number
}

/**
 * Memoized derivations for the OverviewTab: progress stages + deploy readiness
 * checklist, computed from chat messages and project state.
 */
export function useOverviewDerivations(
  project: WorkspaceProject,
  messages: ChatMessage[],
): OverviewDerivations {
  const stages = useMemo(
    () => deriveStagesFromMessages(messages, project),
    [messages, project],
  )
  const readiness = useMemo(() => deriveReadiness(project), [project])
  const readinessMet = readiness.filter((r) => r.met).length
  return { stages, readiness, readinessMet }
}
