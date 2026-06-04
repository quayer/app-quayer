import type { WorkspaceProject } from "@/client/components/projetos/types"
import type { ReadinessItem } from "../types"

/**
 * Pré-requisitos de publicação que a Overview CONSEGUE avaliar com o estado que
 * tem em mãos. Plano/BYOK são validados de verdade no publish (publish-agent.tool)
 * — não entram aqui para não travar o card com sinais que a UI não possui.
 */
export function deriveReadiness(project: WorkspaceProject): ReadinessItem[] {
  const { aiAgent } = project
  return [
    { label: "Agente criado", met: !!aiAgent },
    {
      label: "Prompt configurado",
      met: !!aiAgent?.systemPrompt && aiAgent.systemPrompt.length > 50,
    },
    { label: "Canal conectado", met: project.hasWhatsAppConnection },
  ]
}
