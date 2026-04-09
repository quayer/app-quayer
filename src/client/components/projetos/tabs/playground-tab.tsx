"use client"

import { Bot, Play } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type { WorkspaceProject } from "@/client/components/projetos/types"

interface PlaygroundTabProps {
  project: WorkspaceProject
}

/**
 * PlaygroundTab — placeholder enquanto não portamos o playground real
 * que existe em /integracoes/agents/[id]/playground/playground-client.tsx
 */
export function PlaygroundTab({ project }: PlaygroundTabProps) {
  const { tokens } = useAppTokens()

  const icon = !project.aiAgent ? Bot : Play
  const Icon = icon
  const title = !project.aiAgent
    ? "Aguardando o Builder"
    : "Playground em desenvolvimento"
  const description = !project.aiAgent
    ? "Continue a conversa no chat para o Builder criar seu agente."
    : "Em breve você poderá testar o agente aqui. Por enquanto, use o chat pra simular conversas."

  return (
    <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center gap-4 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: tokens.brandSubtle,
          color: tokens.brand,
        }}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h3
          className="text-base font-semibold"
          style={{ color: tokens.textPrimary }}
        >
          {title}
        </h3>
        <p
          className="mx-auto mt-1 max-w-sm text-[13px]"
          style={{ color: tokens.textSecondary }}
        >
          {description}
        </p>
      </div>
    </div>
  )
}
