"use client"

/**
 * agent_approval — deterministic approval card for the active journey step.
 *
 * The old flow only rendered this through the `propose_agent_creation` tool. If
 * the LLM said "approve the card" without calling that tool, the journey got
 * stuck with no visible card. This card makes approval step-driven like the rest
 * of Jornada v2 while keeping the legacy inline tool card compatible.
 */

import * as React from "react"
import { Check, Pencil, Sparkles } from "lucide-react"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

export interface AgentApprovalPayload {
  action: "confirm"
  name?: string
  description?: string
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function summarizeList(items: readonly string[], fallback: string): string {
  if (items.length === 0) return fallback
  const visible = items.slice(0, 3).join(", ")
  return items.length > 3 ? `${visible} e mais ${items.length - 3}` : visible
}

function deriveAgentProposal(value: CardComponentProps["value"]) {
  const businessName =
    clean(value.persona.name) ??
    clean(value.project.name) ??
    clean(value.sourceIngestion.proposed?.businessName) ??
    "seu negócio"

  const name =
    clean(value.proposal.name) ??
    (businessName.toLowerCase().includes("sdr")
      ? businessName
      : `SDR ${businessName}`)

  const objective =
    clean(value.project.objective) ?? "captar e qualificar leads pelo WhatsApp"
  const offered = summarizeList(value.services.offered, "as dúvidas principais")
  const tone = clean(value.persona.tone) ?? "consultivo e direto"

  const description =
    clean(value.proposal.description) ??
    `Atende leads pelo WhatsApp para ${objective}. Responde sobre ${offered}, conduz a conversa com tom ${tone} e encaminha oportunidades para a equipe quando fizer sentido.`

  return { name, description, objective, offered, tone }
}

export function AgentApprovalCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<AgentApprovalPayload>) {
  const proposal = React.useMemo(() => deriveAgentProposal(value), [value])

  const handleConfirm = React.useCallback(() => {
    onSubmit({
      action: "confirm",
      name: proposal.name,
      description: proposal.description,
    })
  }, [onSubmit, proposal.description, proposal.name])

  const handleAdjust = React.useCallback(() => {
    if (typeof window === "undefined") return
    window.dispatchEvent(
      new CustomEvent("builder:focus-chat", {
        detail: { message: "Quero ajustar a proposta do agente: " },
      }),
    )
  }, [])

  return (
    <CardShell
      icon={<Sparkles className="h-4 w-4" />}
      title={proposal.name}
      reason="Essa é a proposta que será criada agora. Se estiver certa, aprove; se não, ajuste antes de montar."
      tokens={tokens}
      actions={[
        {
          label: "Aprovar e criar agente",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled,
        },
        {
          label: "Ajustar antes",
          onClick: handleAdjust,
          variant: "secondary",
          icon: <Pencil className="h-3.5 w-3.5" />,
          disabled,
        },
      ]}
    >
      <div
        className="rounded-md border px-3 py-3"
        style={{
          backgroundColor: tokens.bgBase,
          borderColor: tokens.divider,
        }}
      >
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: tokens.textPrimary }}
        >
          {proposal.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            `Objetivo: ${proposal.objective}`,
            `Escopo: ${proposal.offered}`,
            `Tom: ${proposal.tone}`,
          ].map((item) => (
            <span
              key={item}
              className="rounded-full border px-2 py-1 text-[11px]"
              style={{
                backgroundColor: tokens.bgSurface,
                borderColor: tokens.divider,
                color: tokens.textSecondary,
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </CardShell>
  )
}

export default AgentApprovalCard
