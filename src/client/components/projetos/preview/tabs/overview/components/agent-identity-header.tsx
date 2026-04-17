"use client"

import { Bot } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { WorkspaceProject } from "@/client/components/projetos/types"
import {
  PROJECT_STATUS_LABEL,
  getProjectStatusStyle,
} from "@/lib/project-status"

interface AgentIdentityHeaderProps {
  aiAgent: NonNullable<WorkspaceProject["aiAgent"]>
  status: WorkspaceProject["status"]
  tokens: AppTokens
}

export function AgentIdentityHeader({
  aiAgent,
  status,
  tokens,
}: AgentIdentityHeaderProps) {
  const statusStyle = getProjectStatusStyle(status)
  const statusLabel = PROJECT_STATUS_LABEL[status]

  return (
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
  )
}
