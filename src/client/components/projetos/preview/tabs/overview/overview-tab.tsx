"use client"

/**
 * OverviewTab — Dynamic Mission Control dashboard for the Builder workspace.
 *
 * Progress stages are derived DYNAMICALLY from tool calls in chat messages.
 * The AI defines the flow — if different features are used, different stages
 * appear. No hardcoded 7-step pipeline.
 *
 * Theme-reactive via useAppTokens.
 */

import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type {
  ChatMessage,
  PreviewTab,
  WorkspaceProject,
} from "@/client/components/projetos/types"
import { AgentIdentityHeader } from "./components/agent-identity-header"
import { DeployReadinessCard } from "./components/deploy-readiness-card"
import { EmptyState } from "./components/empty-state"
import { MetricsCard } from "./components/metrics-card"
import { ProgressHeader } from "./components/progress-header"
import { QuickActions } from "./components/quick-actions"
import { StageList } from "./components/stage-list"
import { useOverviewDerivations } from "./hooks/use-overview-derivations"

export interface OverviewTabProps {
  project: WorkspaceProject
  onTabChange?: (tab: PreviewTab) => void
  messages?: ChatMessage[]
}

export function OverviewTab({
  project,
  onTabChange,
  messages = [],
}: OverviewTabProps) {
  const { tokens } = useAppTokens()
  const { stages, readiness } = useOverviewDerivations(project, messages)

  const doneCount = stages.filter((s) => s.status === "done").length
  const readinessMet = readiness.filter((r) => r.met).length

  /* -- Empty state (no AI agent yet and no conversation) -- */
  if (!project.aiAgent && stages.length === 0) {
    return <EmptyState tokens={tokens} />
  }

  const { aiAgent, status } = project

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {/* -- Section 1: Agent Identity Header (only if agent exists) -- */}
      {aiAgent && (
        <AgentIdentityHeader
          aiAgent={aiAgent}
          status={status}
          tokens={tokens}
        />
      )}

      {/* -- Section 2: Dynamic Stage Progress Tracker -- */}
      {stages.length > 0 && (
        <>
          <ProgressHeader
            doneCount={doneCount}
            totalCount={stages.length}
            tokens={tokens}
          />
          <StageList stages={stages} tokens={tokens} />
        </>
      )}

      {/* -- Section 3: Deploy Readiness Card -- */}
      <DeployReadinessCard
        readiness={readiness}
        readinessMet={readinessMet}
        onTabChange={onTabChange}
        tokens={tokens}
      />

      {/* -- Section 4: Quick Actions -- */}
      <QuickActions onTabChange={onTabChange} tokens={tokens} />

      {/* -- Section 5: Metrics (only for published agents) -- */}
      {status !== "draft" && (
        <MetricsCard tokens={tokens} projectId={project.id} />
      )}
    </div>
  )
}
