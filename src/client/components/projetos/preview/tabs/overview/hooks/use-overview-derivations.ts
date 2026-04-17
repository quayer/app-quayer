import { useMemo } from "react"
import type {
  ChatMessage,
  WorkspaceProject,
} from "@/client/components/projetos/types"
import type { ReadinessItem, Stage } from "../types"
import { deriveReadiness } from "../helpers/derive-readiness"
import { deriveStagesFromMessages } from "../helpers/derive-stages"
import { getCompletedToolNames } from "../helpers/get-completed-tool-names"

interface OverviewDerivations {
  stages: Stage[]
  readiness: ReadinessItem[]
  completedToolNames: Set<string>
}

/**
 * Memoized derivations for the OverviewTab: progress stages and readiness
 * checklist are computed from chat messages and project state.
 */
export function useOverviewDerivations(
  project: WorkspaceProject,
  messages: ChatMessage[],
): OverviewDerivations {
  const stages = useMemo(
    () => deriveStagesFromMessages(messages, project),
    [messages, project],
  )
  const completedToolNames = useMemo(
    () => getCompletedToolNames(messages),
    [messages],
  )
  const readiness = useMemo(
    () => deriveReadiness(project, completedToolNames),
    [project, completedToolNames],
  )
  return { stages, readiness, completedToolNames }
}
