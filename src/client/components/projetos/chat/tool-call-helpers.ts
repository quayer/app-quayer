/**
 * Tool-call helpers — pure parsing/labelling utilities for the inline tool-call
 * cards rendered in the Builder chat. Structural extraction from chat-panel.tsx
 * (no behavior change): every function/value here is dependency-free TS.
 */

// Human-readable labels for builder tool names.
const TOOL_LABELS: Record<string, string> = {
  generate_prompt_anatomy:   "Gerando prompt",
  propose_agent_creation:    "Propondo agente",
  propose_tool_selection:    "Escolhendo capacidades",
  create_agent:              "Criando agente",
  update_agent:              "Atualizando agente",
  select_channel:            "Escolhendo canal",
  list_whatsapp_instances:   "Buscando canais WhatsApp",
  create_whatsapp_instance:  "Criando conexão WhatsApp",
  connect_whatsapp_instance: "Conectando WhatsApp",
  deploy_agent:              "Publicando agente",
  validate_prompt:           "Validando prompt",
  get_project_status:        "Verificando status",
  transfer_to_human:         "Transferindo para humano",
  schedule_appointment:      "Agendando reunião",
  create_lead:               "Registrando lead",
}

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ")
}

// Extract a short human-readable summary from tool result.
// Shows only the message/error field — never the full payload.
export function toolResultSummary(result: unknown): string | null {
  if (!result || typeof result !== "object") return null
  const r = result as Record<string, unknown>
  if (typeof r.message === "string" && r.message) return r.message
  if (typeof r.error === "string" && r.error) return `Erro: ${r.error}`
  if (r.success === false) return "Falha na operação"
  return null
}

export function getStringField(value: unknown, field: string): string | null {
  if (!value || typeof value !== "object") return null
  const raw = (value as Record<string, unknown>)[field]
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}

export function getAgentProposal(args: unknown, result: unknown) {
  return {
    name:
      getStringField(result, "proposedName") ??
      getStringField(args, "name") ??
      "Novo agente",
    description:
      getStringField(result, "proposedDescription") ??
      getStringField(args, "description") ??
      "Revise a proposta e confirme para criar o agente.",
  }
}

export interface ToolSelectionEntry {
  key: string
  title: string
  description: string
  toolKeys: string[]
  icon?: string
  recommended?: boolean
  note?: string
}

export function getToolSelection(result: unknown) {
  if (!result || typeof result !== "object") return null
  const r = result as Record<string, unknown>
  const rawTools = Array.isArray(r.tools) ? r.tools : []
  const tools = rawTools
    .map((item): ToolSelectionEntry | null => {
      if (!item || typeof item !== "object") return null
      const raw = item as Record<string, unknown>
      const key = typeof raw.key === "string" ? raw.key : null
      const title = typeof raw.title === "string" ? raw.title : null
      const description =
        typeof raw.description === "string" ? raw.description : null
      if (!key || !title || !description) return null
      return {
        key,
        title,
        description,
        toolKeys: Array.isArray(raw.toolKeys)
          ? raw.toolKeys.filter((value): value is string => typeof value === "string")
          : [key],
        icon: typeof raw.icon === "string" ? raw.icon : undefined,
        recommended: raw.recommended === true,
        note: typeof raw.note === "string" ? raw.note : undefined,
      }
    })
    .filter((item): item is ToolSelectionEntry => item !== null)

  if (tools.length === 0) return null

  return {
    agentId: getStringField(result, "agentId"),
    reason: getStringField(result, "reason"),
    tools,
  }
}

export function toolHelpText(key: string): string {
  const help: Record<string, string> = {
    schedule_appointment:
      "Use quando o agente puder coletar intenção de agenda e organizar pedido de consulta. A disponibilidade real ainda depende das regras conectadas.",
    send_pricing:
      "Use quando fizer sentido registrar valores ou propostas enviadas. Para advocacia, evite preço automático se isso conflitar com sua regra comercial/OAB.",
    create_lead:
      "Use para marcar o contato como lead qualificado quando houver dados mínimos e interesse claro.",
    transfer_to_human:
      "No WhatsApp, a IA sinaliza a transferência e pausa ou encaminha a conversa conforme a integração. É ideal para casos sensíveis, dúvidas jurídicas ou pedido de advogado.",
    notify_team:
      "Envia um aviso interno sem necessariamente parar a IA. Útil para urgências ou oportunidades que precisam de atenção rápida.",
    // Capacidades de handoff/agenda/preço saíram do catálogo do picker — são
    // DERIVADAS das decisões dos cards na saga (deploy/enabled-tools-derivation.ts).
    lead_only:
      "Marca o lead como qualificado, mas mantém a IA conversando.",
  }
  return help[key] ?? "Ativa uma capacidade operacional do agente."
}

export interface ChannelEntry {
  key: string
  title: string
  description: string
  requiresApproval?: boolean
  /** Agrupamento de nível 1 ('whatsapp' | 'instagram'). Só visual — nunca vai no
   *  payload; o submit usa sempre a chave-folha `key`. */
  platform?: string
}

export function getChannelSelection(result: unknown) {
  if (!result || typeof result !== "object") return null
  const r = result as Record<string, unknown>
  const rawChannels = Array.isArray(r.channels) ? r.channels : []
  const channels = rawChannels
    .map((item): ChannelEntry | null => {
      if (!item || typeof item !== "object") return null
      const raw = item as Record<string, unknown>
      const key = typeof raw.key === "string" ? raw.key : null
      const title = typeof raw.title === "string" ? raw.title : null
      const description =
        typeof raw.description === "string" ? raw.description : null
      if (!key || !title || !description) return null
      return {
        key,
        title,
        description,
        requiresApproval: raw.requiresApproval === true,
        platform: typeof raw.platform === "string" ? raw.platform : undefined,
      }
    })
    .filter((item): item is ChannelEntry => item !== null)

  if (channels.length === 0) return null

  return {
    reason: getStringField(result, "reason"),
    channels,
  }
}

export function getQrResult(result: unknown) {
  if (!result || typeof result !== "object") return null
  const r = result as Record<string, unknown>
  if (r.success !== true) return null
  const instanceId = getStringField(result, "instanceId")
  const qrCodeBase64 = getStringField(result, "qrCodeBase64")
  const shareLink = getStringField(result, "shareLink")
  const expiresIn =
    typeof r.expiresIn === "number" && Number.isFinite(r.expiresIn)
      ? r.expiresIn
      : null
  if (!instanceId && !qrCodeBase64 && !shareLink) return null
  return { instanceId, qrCodeBase64, shareLink, expiresIn }
}
