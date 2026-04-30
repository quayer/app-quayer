import type { WorkspaceProject } from "@/client/components/projetos/types"
import type { ReadinessItem } from "../types"

export function deriveReadiness(
  project: WorkspaceProject,
  completedToolNames: Set<string>,
): ReadinessItem[] {
  const { aiAgent } = project
  return [
    { label: "Agente criado", met: !!aiAgent },
    {
      label: "Prompt configurado",
      met: !!aiAgent?.systemPrompt && aiAgent.systemPrompt.length > 50,
    },
    {
      label: "Canal conectado",
      met: completedToolNames.has("create_whatsapp_instance"),
    },
    { label: "Plano ativo", met: false },
    { label: "BYOK configurado", met: false },
  ]
}
