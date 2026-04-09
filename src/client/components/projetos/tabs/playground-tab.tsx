'use client'

/**
 * PlaygroundTab — US-027
 *
 * Placeholder for the in-workspace playground. The existing full playground
 * lives at src/app/integracoes/agents/[id]/playground/playground-client.tsx
 * and should be adapted/embedded here in a future iteration.
 *
 * TODO: embed or port the existing playground-client.tsx with project.aiAgentId.
 */

import { Card, CardContent } from '@/client/components/ui/card'
import type { WorkspaceProject } from '@/client/components/projetos/types'

interface PlaygroundTabProps {
  project: WorkspaceProject
}

export function PlaygroundTab({ project }: PlaygroundTabProps) {
  if (!project.aiAgent) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aguardando o Builder criar o agente. Continue a conversa no chat.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Card className="max-w-md">
        <CardContent className="p-8 text-center">
          <h3 className="mb-2 text-base font-semibold">Playground em desenvolvimento</h3>
          <p className="text-sm text-muted-foreground">
            Em breve voce podera testar o agente aqui.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
