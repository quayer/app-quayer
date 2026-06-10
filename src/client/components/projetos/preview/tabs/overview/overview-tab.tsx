"use client"

/**
 * OverviewTab — Mission Control do workspace do Builder.
 *
 * FR-18 (spec jornada-builder-v2): o progresso e a prontidão vêm de UMA fonte
 * — `GET /builder/projects/:id/readiness` (step-engine determinístico) — via
 * `useProjectReadiness`. Nada aqui re-deriva progresso de tool-calls.
 *
 * Fluxo de estados:
 *   1. Sem mensagens e sem agent → EmptyState (instrução para iniciar conversa)
 *   2. Readiness carregando      → skeletons
 *   3. Readiness disponível      → checklist da jornada + blockers reais
 */

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type {
  ChatMessage,
  PreviewTab,
  WorkspaceProject,
} from "@/client/components/projetos/types"
import { Skeleton } from "@/client/components/ui/skeleton"
import { canOpenDeploy } from "../../deploy-gate"
import { AgentIdentityHeader } from "./components/agent-identity-header"
import { DeployReadinessCard } from "./components/deploy-readiness-card"
import { EmptyState } from "./components/empty-state"
import { FirstMessagePreviewCard } from "./components/first-message-preview"
import { MetricsCard } from "./components/metrics-card"
import { ProgressHeader } from "./components/progress-header"
import { QuickActions } from "./components/quick-actions"
import { StageList } from "./components/stage-list"
import { deriveFirstMessage } from "./helpers/derive-first-message"
import { useProjectReadiness } from "./hooks/use-project-readiness"

// ── Main tab ─────────────────────────────────────────────────────────────────

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
  const { readiness, stages, checklist, isLoading } = useProjectReadiness(
    project.id,
    messages,
  )
  const firstMessage = deriveFirstMessage(project, messages)
  const deployGate = canOpenDeploy(project)

  const [showCelebration, setShowCelebration] = useState(false)
  const prevAgentRef = useRef(project.aiAgent)

  useEffect(() => {
    if (!prevAgentRef.current && project.aiAgent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowCelebration(true)
      const t = setTimeout(() => setShowCelebration(false), 3000)
      return () => clearTimeout(t)
    }
    prevAgentRef.current = project.aiAgent
  }, [project.aiAgent])

  const doneCount = stages.filter((s) => s.status === "done").length
  const hasAnyActivity = messages.length > 0 || project.aiAgent !== null

  /* -- Estado 1: sem nenhuma atividade → instrui o usuário a começar -- */
  if (!hasAnyActivity) {
    return <EmptyState tokens={tokens} />
  }

  const { aiAgent, status } = project

  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 mx-auto flex max-w-2xl flex-col gap-6">
      {/* -- Celebração: agent recém-criado -- */}
      {showCelebration && (
        <div
          role="status"
          aria-live="polite"
          className="animate-in fade-in slide-in-from-top-2 duration-300 flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-medium"
          style={{
            borderColor: tokens.brand,
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          <span>Agente criado com sucesso!</span>
        </div>
      )}

      {/* -- Seção 1: Identidade do agente -- */}
      {aiAgent && (
        <AgentIdentityHeader
          aiAgent={aiAgent}
          status={status}
          tokens={tokens}
        />
      )}

      {/* -- Seção 2: Primeira mensagem do WhatsApp -- */}
      {aiAgent && (
        <FirstMessagePreviewCard
          tokens={tokens}
          firstMessage={firstMessage.text}
          source={firstMessage.source}
          onEdit={onTabChange ? () => onTabChange("prompt") : undefined}
        />
      )}

      {/* -- Seções 3 + 3b: progresso da jornada + prontidão (fonte única) -- */}
      {isLoading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-6 w-full rounded-md" />
          <Skeleton className="h-[200px] w-full rounded-xl" />
          <Skeleton className="h-[160px] w-full rounded-xl" />
        </div>
      )}

      {readiness && (
        <>
          <ProgressHeader
            doneCount={doneCount}
            totalCount={stages.length}
            pct={readiness.completenessPct}
            tokens={tokens}
          />
          <StageList stages={stages} tokens={tokens} />

          <DeployReadinessCard
            items={checklist}
            isDeployReady={readiness.isDeployReady}
            deployGate={deployGate}
            onTabChange={onTabChange}
            tokens={tokens}
          />
        </>
      )}

      {/* Degradação honesta (NFR-06): falhou o readiness → avisa, sem inventar */}
      {!isLoading && !readiness && (
        <p className="text-[13px]" style={{ color: tokens.textTertiary }}>
          Não foi possível carregar o progresso agora — ele atualiza sozinho
          quando você voltar a esta aba.
        </p>
      )}

      {/* -- Seção 4: Ações rápidas (contextuais ao estado do projeto) -- */}
      <QuickActions
        hasAgent={!!aiAgent}
        hasWhatsAppConnection={project.hasWhatsAppConnection}
        status={status}
        deployGate={deployGate}
        onTabChange={onTabChange}
        tokens={tokens}
      />

      {/* -- Seção 5: Métricas (apenas para agentes publicados) -- */}
      {status !== "draft" && (
        <MetricsCard tokens={tokens} projectId={project.id} />
      )}
    </div>
  )
}
