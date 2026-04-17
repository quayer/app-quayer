"use client"

/**
 * ConnectionStep — readiness checklist (step 1 of deploy wizard)
 *
 * Derives pre-requisite checklist from project state + renders
 * a summary card with per-item tooltips.
 */

import { useMemo } from "react"
import { Check, CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/client/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/client/components/ui/tooltip"
import type { WorkspaceProject } from "@/client/components/projetos/types"
import type { Tokens } from "./deploy-status-card"

export interface ChecklistItem {
  key: string
  label: string
  met: boolean
  hint: string
}

export function deriveChecklist(project: WorkspaceProject): ChecklistItem[] {
  const agent = project.aiAgent
  const promptLength = agent?.systemPrompt?.length ?? 0

  return [
    {
      key: "agent",
      label: "Agente criado",
      met: agent !== null,
      hint: "O Builder precisa criar um agente primeiro.",
    },
    {
      key: "prompt",
      label: "Prompt configurado",
      met: agent !== null && promptLength > 50,
      hint: "O prompt precisa ter pelo menos 50 caracteres.",
    },
    {
      key: "whatsapp",
      label: "Canal WhatsApp conectado",
      // Derived from BuilderDeployment.status === 'live' && connectionId != null.
      // Set server-side in page.tsx → WorkspaceProject.hasWhatsAppConnection.
      met: project.hasWhatsAppConnection,
      hint: "Conecte uma instância do WhatsApp ao agente.",
    },
    {
      key: "plan",
      label: "Plano ativo",
      // TODO: wire to org billing query (out of scope for this task)
      met: false,
      hint: "Ative um plano para publicar em produção.",
    },
    {
      key: "byok",
      label: "BYOK configurado",
      // TODO: wire to org settings/BYOK query (out of scope for this task)
      met: false,
      hint: "Configure sua chave de API (Bring Your Own Key).",
    },
  ]
}

function ChecklistRow({
  item,
  tokens,
}: {
  item: ChecklistItem
  tokens: Tokens
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors"
            style={{ cursor: "default" }}
          >
            {item.met ? (
              <CheckCircle2
                className="h-4 w-4 shrink-0"
                style={{ color: "#22c55e" }}
              />
            ) : (
              <XCircle
                className="h-4 w-4 shrink-0"
                style={{ color: "#ef4444" }}
              />
            )}
            <span
              className="text-[13px]"
              style={{
                color: item.met ? tokens.textPrimary : tokens.textSecondary,
              }}
            >
              {item.label}
            </span>
          </div>
        </TooltipTrigger>
        {!item.met && (
          <TooltipContent
            side="right"
            className="max-w-[220px] text-[12px]"
          >
            {item.hint}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}

export interface ConnectionStepResult {
  checklist: ChecklistItem[]
  metCount: number
  allMet: boolean
  unmetItems: ChecklistItem[]
}

export function useChecklist(project: WorkspaceProject): ConnectionStepResult {
  return useMemo(() => {
    const checklist = deriveChecklist(project)
    const metCount = checklist.filter((c) => c.met).length
    const allMet = metCount === checklist.length
    const unmetItems = checklist.filter((c) => !c.met)
    return { checklist, metCount, allMet, unmetItems }
  }, [project])
}

export function ConnectionStep({
  tokens,
  checklist,
  metCount,
  allMet,
}: {
  tokens: Tokens
  checklist: ChecklistItem[]
  metCount: number
  allMet: boolean
}) {
  return (
    <Card
      className="border p-0 shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: allMet ? "rgba(34,197,94,0.3)" : tokens.divider,
      }}
    >
      <CardContent className="p-0">
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: tokens.divider }}
        >
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: tokens.textTertiary }}
          >
            Pre-requisitos para publicar
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: allMet
                ? "rgba(34,197,94,0.12)"
                : "rgba(245,158,11,0.12)",
              color: allMet ? "#22c55e" : "#f59e0b",
            }}
          >
            {metCount} de {checklist.length}
          </span>
        </div>

        <div className="flex flex-col py-1">
          {checklist.map((item) => (
            <ChecklistRow key={item.key} item={item} tokens={tokens} />
          ))}
        </div>

        <div
          className="border-t px-4 py-2.5"
          style={{ borderColor: tokens.divider }}
        >
          {allMet ? (
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
              <span
                className="text-[12px] font-semibold"
                style={{ color: "#22c55e" }}
              >
                Pronto para publicar!
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AlertTriangle
                className="h-3.5 w-3.5"
                style={{ color: "#f59e0b" }}
              />
              <span
                className="text-[12px] font-medium"
                style={{ color: tokens.textTertiary }}
              >
                {metCount} de {checklist.length} requisitos atendidos
                {" \u2014 "}
                nao e possivel publicar ainda
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
