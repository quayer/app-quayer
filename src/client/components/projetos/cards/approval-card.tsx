"use client"

import * as React from "react"
import { Bot, Check, Pencil, Play, Rocket } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

interface ApprovalCardProps {
  agentName: string
  description?: string
  tokens: AppTokens
  onApprove?: () => void
  onAdjust?: () => void
}

/**
 * ApprovalCard — shown when the Builder AI proposes creating an agent.
 * Displays agent name + summary and offers "Criar Agente" / "Ajustar" actions.
 */
export function ApprovalCard({
  agentName,
  description,
  tokens,
  onApprove,
  onAdjust,
}: ApprovalCardProps) {
  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.brandBorder,
        borderRadius: "16px",
      }}
    >
      <CardContent className="p-0">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ backgroundColor: tokens.brandSubtle }}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: tokens.brand,
              color: tokens.textInverse,
            }}
          >
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[14px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              {agentName}
            </p>
            <p
              className="text-[11px]"
              style={{ color: tokens.textTertiary }}
            >
              Novo agente pronto para ser criado
            </p>
          </div>
        </div>

        {/* Description */}
        {description && (
          <div className="px-4 py-3">
            <p
              className="line-clamp-3 text-[13px] leading-relaxed"
              style={{ color: tokens.textSecondary }}
            >
              {description}
            </p>
          </div>
        )}

        {/* Actions */}
        <div
          className="flex items-center gap-2 border-t px-4 py-3"
          style={{ borderColor: tokens.divider }}
        >
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-lg text-[13px] font-medium"
            style={{
              backgroundColor: tokens.brand,
              color: tokens.textInverse,
            }}
            onClick={onApprove}
          >
            <Check className="h-3.5 w-3.5" />
            Criar Agente
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-lg text-[13px] font-medium"
            style={{
              borderColor: tokens.border,
              color: tokens.textSecondary,
            }}
            onClick={onAdjust}
          >
            <Pencil className="h-3.5 w-3.5" />
            Ajustar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * AgentCreatedCard — shown after create_agent succeeds.
 * Includes 3 contextual CTAs (Tier 3.2) wired via sendMessage intents.
 */
export function AgentCreatedCard({
  agentName,
  agentId,
  versionNumber,
  tokens,
  onTest,
  onEditPrompt,
  onPublish,
}: {
  agentName: string
  agentId: string
  versionNumber?: number
  tokens: AppTokens
  onTest?: () => void
  onEditPrompt?: () => void
  onPublish?: () => void
}) {
  const hasActions = Boolean(onTest || onEditPrompt || onPublish)

  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: "rgba(34,197,94,0.30)",
        borderRadius: "16px",
      }}
    >
      <CardContent className="p-0">
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ backgroundColor: "rgba(34,197,94,0.08)" }}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: "rgba(34,197,94,0.15)",
              color: "#22c55e",
            }}
          >
            <Check className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[14px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              {agentName}
            </p>
            <p
              className="text-[11px]"
              style={{ color: tokens.textTertiary }}
            >
              Agente criado com sucesso
              {versionNumber != null ? ` (v${versionNumber})` : ""}
            </p>
          </div>
        </div>
        <div className="px-4 py-2.5">
          <p
            className="font-mono text-[11px]"
            style={{ color: tokens.textTertiary }}
          >
            ID: {agentId}
          </p>
        </div>
        {hasActions && (
          <div
            className="flex flex-wrap items-center gap-2 border-t px-4 py-3"
            style={{ borderColor: tokens.divider }}
          >
            {onTest && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 rounded-lg text-[12px]"
                style={{ borderColor: tokens.border, color: tokens.textPrimary }}
                onClick={onTest}
              >
                <Play className="h-3.5 w-3.5" />
                Testar
              </Button>
            )}
            {onEditPrompt && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 rounded-lg text-[12px]"
                style={{ borderColor: tokens.border, color: tokens.textPrimary }}
                onClick={onEditPrompt}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar prompt
              </Button>
            )}
            {onPublish && (
              <Button
                size="sm"
                className="h-8 gap-1.5 rounded-lg text-[12px] font-medium"
                style={{
                  backgroundColor: tokens.brand,
                  color: tokens.textInverse,
                }}
                onClick={onPublish}
              >
                <Rocket className="h-3.5 w-3.5" />
                Publicar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
