"use client"

import { FileText, Play, Plug, Rocket } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { PreviewTab, ProjectStatus } from "@/client/components/projetos/types"
import { ActionButton } from "./action-button"

interface QuickActionsProps {
  hasAgent: boolean
  hasWhatsAppConnection: boolean
  status: ProjectStatus
  onTabChange?: (tab: PreviewTab) => void
  tokens: AppTokens
}

/**
 * Shows a single contextual primary action based on the project's current
 * state — one clear next step rather than a full menu of options.
 *
 * Decision tree:
 *   no agent yet         → nothing (BuilderProgressCard handles this state)
 *   agent + no WA        → "Conectar WhatsApp" (primary blocker)
 *   agent + WA + draft   → "Publicar" (final step before go-live)
 *   agent + WA + live    → "Testar agente" (day-to-day action)
 *   agent + WA + paused  → "Testar agente" secondary + "Publicar" primary
 */
export function QuickActions({
  hasAgent,
  hasWhatsAppConnection,
  status,
  onTabChange,
  tokens,
}: QuickActionsProps) {
  if (!hasAgent) return null

  if (!hasWhatsAppConnection) {
    return (
      <div className="flex flex-wrap gap-2">
        <ActionButton
          icon={Plug}
          label="Conectar WhatsApp"
          onClick={() => onTabChange?.("deploy")}
          primary
          tokens={tokens}
        />
        <ActionButton
          icon={FileText}
          label="Ver prompt"
          onClick={() => onTabChange?.("prompt")}
          tokens={tokens}
        />
      </div>
    )
  }

  if (status === "draft" || status === "paused") {
    return (
      <div className="flex flex-wrap gap-2">
        <ActionButton
          icon={Rocket}
          label="Publicar agente"
          onClick={() => onTabChange?.("deploy")}
          primary
          tokens={tokens}
        />
        <ActionButton
          icon={Play}
          label="Testar"
          onClick={() => onTabChange?.("playground")}
          tokens={tokens}
        />
      </div>
    )
  }

  // production
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        icon={Play}
        label="Testar agente"
        onClick={() => onTabChange?.("playground")}
        primary
        tokens={tokens}
      />
      <ActionButton
        icon={FileText}
        label="Editar prompt"
        onClick={() => onTabChange?.("prompt")}
        tokens={tokens}
      />
    </div>
  )
}
