"use client"

/**
 * OverviewTab — Dynamic Mission Control dashboard for the Builder workspace.
 *
 * Fluxo de estados:
 *   1. Sem mensagens          → EmptyState (instrução para iniciar conversa)
 *   2. Mensagens mas sem agent → BuilderProgressCard (etapas live do builder)
 *   3. Com agent              → Overview completo
 */

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type {
  ChatMessage,
  PreviewTab,
  WorkspaceProject,
} from "@/client/components/projetos/types"
import { useBuilderStage } from "@/client/components/projetos/chat/hooks/use-builder-stage"
import { BUILDER_STAGE_DEFS } from "@/client/components/projetos/chat/hooks/builder-stage-defs"
import { Skeleton } from "@/client/components/ui/skeleton"
import { AgentIdentityHeader } from "./components/agent-identity-header"
import { EmptyState } from "./components/empty-state"
import { FirstMessagePreviewCard } from "./components/first-message-preview"
import { MetricsCard } from "./components/metrics-card"
import { ProgressHeader } from "./components/progress-header"
import { QuickActions } from "./components/quick-actions"
import { StageList } from "./components/stage-list"
import { deriveFirstMessage } from "./helpers/derive-first-message"
import { useOverviewDerivations } from "./hooks/use-overview-derivations"

function BuilderProgressCard({ currentStage }: { currentStage: string | null }) {
  const { tokens } = useAppTokens()
  const currentIdx = currentStage
    ? BUILDER_STAGE_DEFS.findIndex((s) => s.key === currentStage)
    : -1

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
    >
      <div
        className="mb-4 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${tokens.divider}`, paddingBottom: 12 }}
      >
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tokens.textTertiary }}
        >
          Progresso do Builder
        </span>
        <Loader2
          className="h-3.5 w-3.5 animate-spin"
          style={{ color: tokens.brand }}
        />
      </div>

      <div className="flex flex-col">
        {BUILDER_STAGE_DEFS.map((stage, i) => {
          const done = i < currentIdx
          const current = i === currentIdx
          return (
            <div key={stage.key} className="flex items-center gap-3 py-2">
              {done ? (
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: tokens.brand, color: "#fff" }}
                >
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </div>
              ) : current ? (
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{
                    border: `2px solid ${tokens.brand}`,
                    backgroundColor: tokens.brandSubtle,
                  }}
                >
                  <div
                    className="h-1.5 w-1.5 animate-pulse rounded-full"
                    style={{ backgroundColor: tokens.brand }}
                  />
                </div>
              ) : (
                <div
                  className="h-5 w-5 shrink-0 rounded-full"
                  style={{ border: `1px solid ${tokens.divider}` }}
                />
              )}

              <span
                className="text-[13px]"
                style={{
                  color: done
                    ? tokens.textSecondary
                    : current
                      ? tokens.textPrimary
                      : tokens.textTertiary,
                  fontWeight: current ? 600 : 400,
                }}
              >
                {stage.label}
              </span>

              {current && (
                <span
                  className="ml-auto text-[11px]"
                  style={{ color: tokens.textTertiary }}
                >
                  {stage.hint}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
  const { stages } = useOverviewDerivations(project, messages)
  const firstMessage = deriveFirstMessage(project, messages)
  const currentStage = useBuilderStage({ messages })

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

  /* -- Estado 2: conversa iniciada mas agent ainda não existe -- */
  if (!project.aiAgent && stages.length === 0) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 mx-auto flex max-w-2xl flex-col gap-6">
        <BuilderProgressCard currentStage={currentStage} />
      </div>
    )
  }

  const { aiAgent, status } = project

  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 mx-auto flex max-w-2xl flex-col gap-6">
      {/* -- Celebração: agent recém-criado -- */}
      {showCelebration && (
        <div
          className="animate-in fade-in slide-in-from-top-2 duration-300 flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-medium"
          style={{
            borderColor: tokens.brand,
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <span>✓</span>
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

      {/* -- Seção 3: Progresso dinâmico de etapas -- */}
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

      {stages.length === 0 && project.aiAgent && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      )}

      {/* -- Seção 4: Ações rápidas (contextuais ao estado do projeto) -- */}
      <QuickActions
        hasAgent={!!aiAgent}
        hasWhatsAppConnection={project.hasWhatsAppConnection}
        status={status}
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
