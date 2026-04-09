"use client"

/**
 * OverviewTab — visão geral do agente (nome, status, métricas, ações)
 *
 * Tema reativo via useAppTokens. Ações agora usam `onTabChange`
 * callback (passado do workspace via preview-panel), não router.push —
 * evita navegação RSC desnecessária em cada click de tab.
 */

import { Bot, Play, Rocket } from "lucide-react"
import { Card, CardContent } from "@/client/components/ui/card"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type {
  PreviewTab,
  WorkspaceProject,
} from "@/client/components/projetos/types"
import {
  PROJECT_STATUS_LABEL,
  getProjectStatusStyle,
} from "@/lib/project-status"

interface OverviewTabProps {
  project: WorkspaceProject
  onTabChange?: (tab: PreviewTab) => void
}

export function OverviewTab({ project, onTabChange }: OverviewTabProps) {
  const { tokens } = useAppTokens()

  if (!project.aiAgent) {
    return (
      <div className="mx-auto flex min-h-[280px] max-w-md flex-col items-center justify-center gap-3 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Bot className="h-5 w-5" />
        </div>
        <h3
          className="text-sm font-semibold"
          style={{ color: tokens.textPrimary }}
        >
          Aguardando o Builder
        </h3>
        <p
          className="max-w-xs text-[13px]"
          style={{ color: tokens.textSecondary }}
        >
          Continue a conversa no chat para o Builder criar seu agente.
        </p>
      </div>
    )
  }

  const { aiAgent, status } = project
  const statusStyle = getProjectStatusStyle(status)
  const statusLabel = PROJECT_STATUS_LABEL[status]

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {/* Header — agent identity */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: tokens.brandSubtle,
              color: tokens.brand,
            }}
          >
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              className="truncate text-xl font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              {aiAgent.name}
            </h2>
            <p
              className="mt-0.5 text-[12px]"
              style={{ color: tokens.textTertiary }}
            >
              {aiAgent.provider} · {aiAgent.model}
            </p>
          </div>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
          style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: statusStyle.dot }}
          />
          {statusLabel}
        </span>
      </div>

      {/* Metrics card */}
      <Card
        className="border p-0 shadow-none"
        style={{
          backgroundColor: tokens.bgSurface,
          borderColor: tokens.divider,
        }}
      >
        <CardContent className="p-5">
          <h3
            className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: tokens.textTertiary }}
          >
            Métricas
          </h3>
          {status === "draft" ? (
            <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
              Agente ainda não publicado. Publique para começar a coletar
              métricas.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              <Metric label="Mensagens" value="0" tokens={tokens} />
              <Metric label="Taxa de resposta" value="—%" tokens={tokens} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <ActionButton
          icon={Play}
          label="Testar no Playground"
          onClick={() => onTabChange?.("playground")}
          primary
          tokens={tokens}
        />
        <ActionButton
          icon={Rocket}
          label="Publicar"
          onClick={() => onTabChange?.("deploy")}
          tokens={tokens}
        />
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  tokens,
}: {
  label: string
  value: string
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  return (
    <div>
      <div
        className="text-[11px] font-medium uppercase tracking-wider"
        style={{ color: tokens.textTertiary }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-bold"
        style={{ color: tokens.textPrimary }}
      >
        {value}
      </div>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary = false,
  tokens,
}: {
  icon: typeof Bot
  label: string
  onClick: () => void
  primary?: boolean
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-[13px] font-medium transition-colors"
      style={
        primary
          ? {
              backgroundColor: tokens.brand,
              borderColor: tokens.brand,
              color: tokens.textInverse,
            }
          : {
              backgroundColor: "transparent",
              borderColor: tokens.border,
              color: tokens.textPrimary,
            }
      }
      onMouseEnter={(e) => {
        if (!primary) {
          e.currentTarget.style.backgroundColor = tokens.hoverBg
        }
      }}
      onMouseLeave={(e) => {
        if (!primary) {
          e.currentTarget.style.backgroundColor = "transparent"
        }
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
