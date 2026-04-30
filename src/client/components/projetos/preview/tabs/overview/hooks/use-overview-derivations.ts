import { useMemo } from "react"
import type {
  ChatMessage,
  WorkspaceProject,
} from "@/client/components/projetos/types"
import type { Stage } from "../types"
import { deriveStagesFromMessages } from "../helpers/derive-stages"

interface OverviewDerivations {
  stages: Stage[]
}

/**
 * Memoized derivations for the OverviewTab: progress stages computed from
 * chat messages and project state.
 */
export function useOverviewDerivations(
  project: WorkspaceProject,
  messages: ChatMessage[],
): OverviewDerivations {
  const stages = useMemo(
    () => deriveStagesFromMessages(messages, project),
    [messages, project],
  )
  return { stages }
}
