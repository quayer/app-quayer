"use client"

import { FileText, Play, Plug, Rocket } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { PreviewTab } from "@/client/components/projetos/types"
import { AskBuilderButton } from "../../../shared/ask-builder-button"
import { ActionButton } from "./action-button"

interface QuickActionsProps {
  onTabChange?: (tab: PreviewTab) => void
  tokens: AppTokens
}

export function QuickActions({ onTabChange, tokens }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        icon={Play}
        label="Testar no Playground"
        onClick={() => onTabChange?.("playground")}
        primary
        tokens={tokens}
      />
      <ActionButton
        icon={FileText}
        label="Editar Prompt"
        onClick={() => onTabChange?.("prompt")}
        tokens={tokens}
      />
      <AskBuilderButton
        tokens={tokens}
        message="Revise o progresso atual do agente e sugira proximos passos"
      />
      <ActionButton
        icon={Plug}
        label="Conectar WhatsApp"
        onClick={() => onTabChange?.("deploy")}
        tokens={tokens}
      />
      <ActionButton
        icon={Rocket}
        label="Publicar"
        onClick={() => onTabChange?.("deploy")}
        tokens={tokens}
      />
    </div>
  )
}
