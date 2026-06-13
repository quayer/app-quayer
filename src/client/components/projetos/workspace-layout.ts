import type { WorkspaceProject } from "./types"
import type { Readiness } from "@/server/ai-module/builder/state/readiness.types"

type LayoutProject = Pick<WorkspaceProject, "aiAgent" | "journeyVersion">

interface ChatOnlyLayoutInput {
  project: LayoutProject
  readiness: Pick<Readiness, "journey"> | undefined
}

export function shouldUseChatOnlyLayout({
  project,
  readiness,
}: ChatOnlyLayoutInput): boolean {
  if (readiness?.journey?.activePhaseId === "conhecer") return true

  return (
    project.journeyVersion === 2 &&
    project.aiAgent === null &&
    readiness === undefined
  )
}
