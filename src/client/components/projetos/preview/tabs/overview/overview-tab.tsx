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
import { useCallback, useEffect, useRef, useState } from "react"
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
  // Greeting canônico vem do readiness (builderState.persona.greeting) — o
  // mesmo hook acima, com refetch por activity-signal (pós-submit do card).
  const firstMessage = deriveFirstMessage(project, readiness)
  const deployGate = canOpenDeploy(project)

  const [showCelebration, setShowCelebration] = useState(false)
  // Compara por id (não por identidade de objeto): cada router.refresh cria um
  // objeto novo e re-celebrava "Agente criado" em eventos que não são criação.
  const prevAgentIdRef = useRef<string | null>(project.aiAgent?.id ?? null)

  useEffect(() => {
    // Atualiza a ref INCONDICIONALMENTE antes de qualquer return — o cleanup
    // do setTimeout fazia a antiga atribuição nunca rodar após a 1ª celebração.
    const prevId = prevAgentIdRef.current
    const currentId = project.aiAgent?.id ?? null
    prevAgentIdRef.current = currentId
    if (!prevId && currentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- celebração one-shot disparada pela transição null→agente do snapshot RSC
      setShowCelebration(true)
      const t = setTimeout(() => setShowCelebration(false), 3000)
      return () => clearTimeout(t)
    }
  }, [project.aiAgent?.id])

  // "Editar" da primeira mensagem → chat com rascunho pré-preenchido (o card
  // de persona é o dono do greeting; a tab Prompt não tem campo de saudação).
  const handleEditGreeting = useCallback(() => {
    if (typeof window === "undefined") return
    window.dispatchEvent(
      new CustomEvent("builder:focus-chat", {
        detail: {
          message:
            "Quero ajustar a saudação inicial que o agente envia aos clientes",
        },
      }),
    )
  }, [])

  const doneCount = stages.filter((s) => s.status === "done").length
  const hasAnyActivity = messages.length > 0 || project.aiAgent !== null

  // Canal: prefere o readiness (fonte única, cobre conexão feita pelo wizard
  // sem router.refresh); o snapshot SSR fica como fallback enquanto carrega.
  const hasChannel = readiness
    ? !readiness.blockers.some((b) => b.check === "channel")
    : project.hasWhatsAppConnection

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
          onEdit={handleEditGreeting}
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
        hasWhatsAppConnection={hasChannel}
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
