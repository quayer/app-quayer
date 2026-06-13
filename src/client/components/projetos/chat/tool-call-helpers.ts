/**
 * Tool-call helpers — pure parsing/labelling utilities for the inline tool-call
 * cards rendered in the Builder chat. Structural extraction from chat-panel.tsx
 * (no behavior change): every function/value here is dependency-free TS.
 */

import type { LucideIcon } from "lucide-react"
import {
  ImageIcon,
  Keyboard,
  Languages,
  Mic,
  Timer,
  Volume2,
} from "lucide-react"

/** One capability tile rendered in the `propose_agent_creation` proposal card. */
export interface AgentCapabilityTile {
  icon: LucideIcon
  title: string
  detail: string
  state: string
}

/** Static capability tiles for the agent-proposal card (pure presentational data). */
export const AGENT_PROPOSAL_CAPABILITIES: readonly AgentCapabilityTile[] = [
  { icon: ImageIcon, title: "Mídia", detail: "imagem, áudio, documento e vídeo", state: "ativo" },
  { icon: Timer, title: "Buffer", detail: "concatenação de mensagens", state: "ativo" },
  { icon: Keyboard, title: "Digitando", detail: "presença antes da resposta", state: "ativo" },
  { icon: Languages, title: "Idioma", detail: "detecção opcional", state: "opcional" },
  { icon: Volume2, title: "Áudio", detail: "callback com ElevenLabs", state: "opcional" },
  { icon: Mic, title: "Custos", detail: "leitura de mídia pode ser desligada", state: "controle" },
]

// Human-readable labels for builder tool names.
const TOOL_LABELS: Record<string, string> = {
  generate_conversation_blueprint: "Montando plano de atendimento",
  generate_prompt_anatomy:   "Gerando prompt",
  run_agent_refinement:      "Refinando agente",
  propose_agent_creation:    "Propondo agente",
  propose_tool_selection:    "Escolhendo capacidades",
  quick_reply_chips:         "Preparando respostas",
  set_project_basics:        "Dados registrados",
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

export type RefinementRunStatus =
  | "idle"
  | "running"
  | "passed"
  | "failed"
  | "needs_user_decision"

export interface RefinementRunToolSummary {
  success?: boolean
  status?: RefinementRunStatus
  score?: number
  scenarioCount?: number
  checkCount?: number
  blockerCount?: number
  failedCount?: number
  warningCount?: number
  message?: string
  code?: string
}

function getFiniteNumberField(
  value: Record<string, unknown>,
  field: string,
): number | undefined {
  const raw = value[field]
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined
}

function getRefinementStatus(value: unknown): RefinementRunStatus | undefined {
  return value === "idle" ||
    value === "running" ||
    value === "passed" ||
    value === "failed" ||
    value === "needs_user_decision"
    ? value
    : undefined
}

export function getRefinementRunSummary(
  result: unknown,
): RefinementRunToolSummary | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null
  }
  const r = result as Record<string, unknown>
  const success = typeof r.success === "boolean" ? r.success : undefined
  const status = getRefinementStatus(r.status)
  const score = getFiniteNumberField(r, "score")
  const scenarioCount = getFiniteNumberField(r, "scenarioCount")
  const checkCount = getFiniteNumberField(r, "checkCount")
  const blockerCount = getFiniteNumberField(r, "blockerCount")
  const failedCount = getFiniteNumberField(r, "failedCount")
  const warningCount = getFiniteNumberField(r, "warningCount")
  const message = getStringField(result, "message") ?? undefined
  const code = getStringField(result, "code") ?? undefined

  if (
    success === undefined &&
    status === undefined &&
    score === undefined &&
    scenarioCount === undefined &&
    checkCount === undefined &&
    blockerCount === undefined &&
    failedCount === undefined &&
    warningCount === undefined &&
    message === undefined &&
    code === undefined
  ) {
    return null
  }

  return {
    success,
    status,
    score,
    scenarioCount,
    checkCount,
    blockerCount,
    failedCount,
    warningCount,
    message,
    code,
  }
}

export interface QuickReplyToolChip {
  value: string
  label?: string
}

function normalizeQuickReplyChips(value: unknown): QuickReplyToolChip[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const out: QuickReplyToolChip[] = []
  for (const item of value) {
    let chipValue = ""
    let chipLabel: string | undefined

    if (typeof item === "string") {
      chipValue = item.trim()
    } else if (item && typeof item === "object") {
      const raw = item as Record<string, unknown>
      chipValue = typeof raw.value === "string" ? raw.value.trim() : ""
      const label = typeof raw.label === "string" ? raw.label.trim() : ""
      chipLabel = label.length > 0 ? label : undefined
    }

    if (!chipValue || seen.has(chipValue)) continue
    seen.add(chipValue)
    out.push(chipLabel ? { value: chipValue, label: chipLabel } : { value: chipValue })
  }

  return out
}

export function getQuickReplyChips(args: unknown, result: unknown) {
  const resultRecord =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : null
  const argsRecord =
    args && typeof args === "object" ? (args as Record<string, unknown>) : null

  if (resultRecord?.success === false) return null

  const prompt =
    getStringField(result, "prompt") ??
    getStringField(args, "prompt") ??
    "Escolha uma opção para responder."
  const chips = normalizeQuickReplyChips(
    resultRecord?.chips ?? argsRecord?.chips,
  )

  return chips.length > 0 ? { prompt, chips } : null
}

export function isSuccessfulToolResult(result: unknown): boolean {
  return Boolean(
    result &&
      typeof result === "object" &&
      (result as Record<string, unknown>).success === true,
  )
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
