"use client"

/**
 * OverviewTab — Mission Control do workspace do Builder.
 *
 * FR-18 (spec jornada-builder-v2): o progresso e a prontidão vêm de UMA fonte
 * — `GET /builder/projects/:id/readiness` (step-engine determinístico) —
 * içada pelo `workspace.tsx` e recebida por props. Nada aqui re-deriva
 * progresso de tool-calls nem abre uma segunda query.
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
import type { Readiness } from "@/server/ai-module/builder/state/readiness.types"
import { Skeleton } from "@/client/components/ui/skeleton"
import { canOpenDeploy } from "../../deploy-gate"
import { AgentIdentityHeader } from "./components/agent-identity-header"
import { CapabilitiesSection } from "./components/capabilities-section"
import { DeployReadinessCard } from "./components/deploy-readiness-card"
import { EmptyState } from "./components/empty-state"
import { FirstMessagePreviewCard } from "./components/first-message-preview"
import { MetricsCard } from "./components/metrics-card"
import { NextStepCard } from "./components/next-step-card"
import { PhaseList } from "./components/phase-list"
import { ProgressHeader } from "./components/progress-header"
import { StageList } from "./components/stage-list"
import { deriveFirstMessage } from "./helpers/derive-first-message"
import {
  blockersToChecklist,
  journeyToPhases,
  stepsToStages,
} from "./helpers/readiness-adapters"

// ── Main tab ─────────────────────────────────────────────────────────────────

export interface OverviewTabProps {
  project: WorkspaceProject
  onTabChange?: (tab: PreviewTab) => void
  messages?: ChatMessage[]
  readiness?: Readiness
  readinessLoading?: boolean
  readinessError?: boolean
}

export function OverviewTab({
  project,
  onTabChange,
  messages = [],
  readiness,
  readinessLoading = false,
  readinessError = false,
}: OverviewTabProps) {
  const { tokens } = useAppTokens()
  const stages = React.useMemo(
    () => (readiness ? stepsToStages(readiness) : []),
    [readiness],
  )
  const phases = React.useMemo(
    () => (readiness ? journeyToPhases(readiness) : null),
    [readiness],
  )
  const checklist = React.useMemo(
    () => (readiness ? blockersToChecklist(readiness) : []),
    [readiness],
  )
  const isLoading = readiness === undefined && readinessLoading
  // Greeting canônico vem do readiness içado (builderState.persona.greeting).
  const firstMessage = deriveFirstMessage(project, readiness ?? null)
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
  const showDeployReadiness =
    !readiness?.journey ||
    readiness.journey.activePhaseId === "lancar" ||
    readiness.isDeployReady

  // T101b (FR-32): na revelação da Visão geral (projetos v2) cada seção monta
  // em cascata (~100ms de stagger via CSS). Atrelado a `phases` (presente só em
  // v2) → em v1 retorna "" e o render fica byte-idêntico (NFR-03). O
  // `prefers-reduced-motion` global salta direto pro estado final.
  const isJourneyV2 = phases !== null
  const stagger = (n: number) =>
    isJourneyV2 ? `builder-section-in builder-stagger-${n}` : ""

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

      {/* -- Seção 1: próximo passo dominante -- */}
      {readiness && (
        <div className={stagger(1)}>
          <NextStepCard
            readiness={readiness}
            deployGate={deployGate}
            onTabChange={onTabChange}
            tokens={tokens}
          />
        </div>
      )}

      {/* -- Seção 2: Identidade do agente -- */}
      {aiAgent && (
        <div className={stagger(2)}>
          <AgentIdentityHeader
            aiAgent={aiAgent}
            status={status}
            tokens={tokens}
          />
        </div>
      )}

      {/* -- Seção 3: Primeira mensagem do WhatsApp -- */}
      {aiAgent && (
        <div className={stagger(3)}>
          <FirstMessagePreviewCard
            tokens={tokens}
            firstMessage={firstMessage.text}
            source={firstMessage.source}
            onEdit={handleEditGreeting}
          />
        </div>
      )}

      {/* -- Seções 4 + 5: progresso da jornada + capacidades -- */}
      {isLoading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-6 w-full rounded-md" />
          <Skeleton className="h-[200px] w-full rounded-xl" />
          <Skeleton className="h-[160px] w-full rounded-xl" />
        </div>
      )}

      {readiness && (
        <>
          <div className={stagger(4)}>
            <ProgressHeader
              doneCount={doneCount}
              totalCount={stages.length}
              pct={readiness.completenessPct}
              tokens={tokens}
            />
          </div>
          {/* v2: render por fases (Journey "Configure por exceção"); v1: lista
              plana intocada (render byte-idêntico, NFR-03). */}
          <div className={stagger(5)}>
            {phases ? (
              <PhaseList phases={phases} tokens={tokens} />
            ) : (
              <StageList stages={stages} tokens={tokens} />
            )}
          </div>

          {/* Seção 6: o que o agente faz (FR-06/07). Resumo + ações curtas;
              configuração detalhada vive no chat ou na tab dona do recurso. */}
          {readiness.builderState && (
            <div className={stagger(6)}>
              <CapabilitiesSection
                projectId={project.id}
                builderState={readiness.builderState}
                tokens={tokens}
                onTabChange={onTabChange}
              />
            </div>
          )}

          {showDeployReadiness && (
            <div className={stagger(7)}>
              <DeployReadinessCard
                items={checklist}
                isDeployReady={readiness.isDeployReady}
                deployGate={deployGate}
                onTabChange={onTabChange}
                tokens={tokens}
              />
            </div>
          )}
        </>
      )}

      {/* Degradação honesta (NFR-06): falhou o readiness → avisa, sem inventar */}
      {!isLoading && !readiness && (
        <p className="text-[13px]" style={{ color: tokens.textTertiary }}>
          {readinessError
            ? "Não foi possível carregar o progresso agora — estou tentando reconectar."
            : "Não foi possível carregar o progresso agora — ele atualiza sozinho quando você voltar a esta aba."}
        </p>
      )}

      {/* -- Seção final: Métricas (apenas para agentes publicados) -- */}
      {status !== "draft" && (
        <div className={stagger(8)}>
          <MetricsCard tokens={tokens} projectId={project.id} />
        </div>
      )}
    </div>
  )
}
