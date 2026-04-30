"use client"

/**
 * ActivityTab — timeline vertical das ações executadas pela IA no workspace.
 *
 * _core tab: visível para TODOS os project types (agent, campaign, flow, …).
 * Deriva os items de `messages`: pega todas as mensagens assistant que têm
 * `toolCalls` e achata num array cronológico. O item mais recente aparece
 * no topo. Limitado a 50 items mais recentes pra não estourar layout.
 *
 * Theme-reactive via useAppTokens — tokens aplicados via style inline.
 * Sem dependência de backend: consome apenas o que o chat-panel já hidrata.
 */

import { useMemo, useState, type ComponentType } from "react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Activity,
  ChevronDown,
  FileText,
  Globe,
  List,
  Pencil,
  Play,
  Plug,
  Rocket,
  Smartphone,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/client/components/ui/collapsible"
import { useAppTokens, type AppTokens } from "@/client/hooks/use-app-tokens"
import type {
  ChatMessage,
  WorkspaceProject,
} from "@/client/components/projetos/types"

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

export interface ActivityTabProps {
  project: WorkspaceProject
  messages: ChatMessage[]
}

/* -------------------------------------------------------------------------- */
/*  Tool registry                                                             */
/* -------------------------------------------------------------------------- */

type LucideIcon = ComponentType<{ className?: string }>

interface ToolMeta {
  label: string
  icon: LucideIcon
  category: "setup" | "prompt" | "query" | "publish" | "test" | "other"
}

const TOOL_LABELS: Record<string, ToolMeta> = {
  create_agent: { label: "Criou o agente", icon: Sparkles, category: "setup" },
  update_agent_prompt: {
    label: "Atualizou o prompt",
    icon: Pencil,
    category: "prompt",
  },
  list_whatsapp_instances: {
    label: "Listou instâncias WhatsApp",
    icon: List,
    category: "query",
  },
  create_whatsapp_instance: {
    label: "Criou instância WhatsApp",
    icon: Smartphone,
    category: "setup",
  },
  attach_tool_to_agent: {
    label: "Anexou tool ao agente",
    icon: Plug,
    category: "setup",
  },
  search_web: { label: "Buscou na web", icon: Globe, category: "query" },
  generate_prompt_anatomy: {
    label: "Gerou anatomia do prompt",
    icon: FileText,
    category: "prompt",
  },
  publish_agent: {
    label: "Publicou versão",
    icon: Rocket,
    category: "publish",
  },
  get_agent_status: {
    label: "Consultou status",
    icon: Activity,
    category: "query",
  },
  run_playground_test: {
    label: "Testou no playground",
    icon: Play,
    category: "test",
  },
  create_custom_tool: {
    label: "Criou tool customizada",
    icon: Wrench,
    category: "setup",
  },
}

const FALLBACK: ToolMeta = { label: "Ação", icon: Zap, category: "other" }

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface ActivityItem {
  key: string
  messageId: string
  timestamp: string
  toolName: string
  args: unknown
  result?: unknown
}

type Status = "ok" | "error" | "pending"

const MAX_ITEMS = 50

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function deriveStatus(result: unknown): Status {
  if (result === undefined) return "pending"
  if (isRecord(result) && "error" in result && result.error !== undefined) {
    return "error"
  }
  return "ok"
}

function formatJsonPreview(value: unknown, max = 300): string {
  if (value === undefined) return "—"
  try {
    const str = JSON.stringify(value, null, 2)
    if (str === undefined) return String(value)
    return str.length > max ? `${str.slice(0, max)}…` : str
  } catch {
    return String(value)
  }
}

function formatRelative(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ""
  try {
    return formatDistanceToNow(date, { addSuffix: true, locale: ptBR })
  } catch {
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }
}

const STATUS_COLORS = {
  ok: "#10b981",
  error: "#ef4444",
} as const

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function ActivityTab({ project: _project, messages }: ActivityTabProps) {
  const { tokens } = useAppTokens()

  const { items, totalCount } = useMemo(() => {
    const flat: ActivityItem[] = messages
      .filter(
        (m) => m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0,
      )
      .flatMap((m) =>
        (m.toolCalls ?? []).map((tc, idx) => ({
          key: `${m.id}-${idx}`,
          messageId: m.id,
          timestamp: m.createdAt,
          toolName: tc.toolName,
          args: tc.args,
          result: tc.result,
        })),
      )

    // Most recent first
    const reversed = [...flat].reverse()
    return { items: reversed.slice(0, MAX_ITEMS), totalCount: reversed.length }
  }, [messages])

  /* -- Empty state -- */
  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 py-12 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Activity className="h-7 w-7" />
        </div>
        <h3
          className="text-sm font-semibold"
          style={{ color: tokens.textPrimary }}
        >
          Sem atividade ainda
        </h3>
        <p
          className="max-w-xs text-[13px]"
          style={{ color: tokens.textTertiary }}
        >
          Nenhuma ação executada ainda. Comece conversando no chat à esquerda.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {/* -- Header -- */}
      <div className="flex items-baseline justify-between">
        <h2
          className="text-sm font-semibold"
          style={{ color: tokens.textPrimary }}
        >
          Atividade do agente
        </h2>
        <span
          className="text-[11px]"
          style={{ color: tokens.textTertiary }}
        >
          {totalCount} {totalCount === 1 ? "ação" : "ações"}
          {totalCount > MAX_ITEMS && ` · mostrando últimas ${MAX_ITEMS}`}
        </span>
      </div>

      {/* -- Timeline -- */}
      <div className="flex flex-col">
        {items.map((item, i) => (
          <ActivityRow
            key={item.key}
            item={item}
            isLast={i === items.length - 1}
            tokens={tokens}
          />
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Row                                                                       */
/* -------------------------------------------------------------------------- */

function ActivityRow({
  item,
  isLast,
  tokens,
}: {
  item: ActivityItem
  isLast: boolean
  tokens: AppTokens
}) {
  const [open, setOpen] = useState(false)
  const meta = TOOL_LABELS[item.toolName] ?? FALLBACK
  const Icon = meta.icon
  const status = deriveStatus(item.result)
  const relative = formatRelative(item.timestamp)

  const statusColor =
    status === "pending"
      ? tokens.textTertiary
      : status === "ok"
        ? STATUS_COLORS.ok
        : STATUS_COLORS.error

  const statusLabel =
    status === "pending" ? "pending" : status === "ok" ? "ok" : "erro"

  return (
    <div className="relative flex gap-3">
      {/* -- Rail: icon + connector -- */}
      <div className="relative flex flex-col items-center">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
        {!isLast && (
          <div
            className="w-px flex-1"
            style={{
              backgroundColor: tokens.divider,
              minHeight: 12,
            }}
          />
        )}
      </div>

      {/* -- Content -- */}
      <div className={`flex min-w-0 flex-1 flex-col ${isLast ? "" : "pb-4"}`}>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger
            className="group flex w-full items-start justify-between gap-3 rounded-md px-2 py-1 text-left transition-colors"
            style={{
              backgroundColor: open ? tokens.hoverBg : "transparent",
            }}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="truncate text-sm font-medium"
                  style={{ color: tokens.textPrimary }}
                >
                  {meta.label}
                </span>
                <ChevronDown
                  className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
                  style={{ color: tokens.textTertiary }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px]"
                  style={{ color: tokens.textTertiary }}
                >
                  {relative || item.toolName}
                </span>
                <span
                  className="font-mono text-[10px] opacity-70"
                  style={{ color: tokens.textTertiary }}
                >
                  {item.toolName}
                </span>
              </div>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{
                color: statusColor,
                backgroundColor:
                  status === "pending" ? tokens.hoverBg : `${statusColor}1A`,
              }}
            >
              {statusLabel}
            </span>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-2 flex flex-col gap-2">
            <PreviewBlock label="Args" value={item.args} tokens={tokens} />
            <PreviewBlock
              label="Resultado"
              value={item.result}
              tokens={tokens}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Preview block                                                             */
/* -------------------------------------------------------------------------- */

function PreviewBlock({
  label,
  value,
  tokens,
}: {
  label: string
  value: unknown
  tokens: AppTokens
}) {
  return (
    <div
      className="rounded-md border"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <div
        className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide"
        style={{
          color: tokens.textTertiary,
          borderBottom: `1px solid ${tokens.divider}`,
        }}
      >
        {label}
      </div>
      <pre
        className="max-h-48 overflow-auto px-2.5 py-2 text-[11px] leading-relaxed"
        style={{ color: tokens.textSecondary }}
      >
        {formatJsonPreview(value)}
      </pre>
    </div>
  )
}
