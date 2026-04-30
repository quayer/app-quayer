/**
 * Project type metadata — single source of truth pra label/ícone/cor
 * de cada tipo de projeto do Builder.
 *
 * v1 só tem 'ai_agent'. v1.5+ adicionará wa_campaign, ig_automation,
 * wa_tracking, wa_flow, wa_group conforme arch v5.3 §3.
 *
 * Mantido aqui (lib) pra client + server poderem importar — zero
 * runtime deps, puro type + data.
 */
import {
  Bot,
  Megaphone,
  Target,
  Workflow,
  Instagram,
  Users,
  type LucideIcon,
} from "lucide-react"

export type ProjectType =
  | "ai_agent"
  | "wa_campaign"
  | "ig_automation"
  | "wa_tracking"
  | "wa_flow"
  | "wa_group"

export interface ProjectTypeMeta {
  label: string
  shortLabel: string
  icon: LucideIcon
  description: string
}

export const PROJECT_TYPE_META: Record<ProjectType, ProjectTypeMeta> = {
  ai_agent: {
    label: "Agente IA",
    shortLabel: "Agente",
    icon: Bot,
    description: "Agente de WhatsApp alimentado por IA",
  },
  wa_campaign: {
    label: "Campanha WhatsApp",
    shortLabel: "Campanha",
    icon: Megaphone,
    description: "Disparo em massa com segmentação",
  },
  ig_automation: {
    label: "Automação Instagram",
    shortLabel: "Instagram",
    icon: Instagram,
    description: "Responder DMs e comentários automaticamente",
  },
  wa_tracking: {
    label: "Tracking Meta",
    shortLabel: "Tracking",
    icon: Target,
    description: "Métricas e conversão de anúncios Meta",
  },
  wa_flow: {
    label: "Flow WhatsApp",
    shortLabel: "Flow",
    icon: Workflow,
    description: "Fluxos visuais estruturados",
  },
  wa_group: {
    label: "Grupo WhatsApp",
    shortLabel: "Grupo",
    icon: Users,
    description: "Gestão de grupos automatizada",
  },
}

/** Safe lookup with fallback to ai_agent (único tipo v1). */
export function getProjectTypeMeta(type: string): ProjectTypeMeta {
  return PROJECT_TYPE_META[type as ProjectType] ?? PROJECT_TYPE_META.ai_agent
}
