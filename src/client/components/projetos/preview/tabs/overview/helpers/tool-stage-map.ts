/**
 * Maps Builder tool names to human-readable stage labels.
 * Only tools that represent meaningful progress milestones are listed.
 * The order here determines display order.
 */
export const TOOL_STAGE_MAP: Array<{
  toolName: string
  label: string
  detailFn?: (result: unknown) => string | undefined
}> = [
  {
    toolName: "generate_prompt_anatomy",
    label: "Prompt gerado",
    detailFn: (result) => {
      if (result && typeof result === "object" && (result as Record<string, unknown>).success) {
        const prompt = (result as Record<string, unknown>).prompt
        if (typeof prompt === "string") return `${prompt.length} caracteres`
      }
      return undefined
    },
  },
  {
    toolName: "create_agent",
    label: "Agente criado",
    detailFn: (result) => {
      if (result && typeof result === "object") {
        const r = result as Record<string, unknown>
        if (r.agentName && typeof r.agentName === "string") return r.agentName
        if (r.name && typeof r.name === "string") return r.name
      }
      return undefined
    },
  },
  {
    toolName: "update_agent_prompt",
    label: "Prompt atualizado",
  },
  {
    toolName: "attach_tool_to_agent",
    label: "Ferramenta configurada",
    detailFn: (result) => {
      if (result && typeof result === "object") {
        const r = result as Record<string, unknown>
        if (r.toolName && typeof r.toolName === "string") return r.toolName
      }
      return undefined
    },
  },
  {
    toolName: "create_custom_tool",
    label: "Ferramenta customizada criada",
  },
  {
    toolName: "list_whatsapp_instances",
    label: "Canais consultados",
  },
  {
    toolName: "create_whatsapp_instance",
    label: "Canal WhatsApp conectado",
  },
  {
    toolName: "run_playground_test",
    label: "Teste executado",
  },
  {
    toolName: "publish_agent",
    label: "Agente publicado",
    detailFn: (result) => {
      if (result && typeof result === "object") {
        const r = result as Record<string, unknown>
        if (r.success) return "Em produção"
      }
      return undefined
    },
  },
]
