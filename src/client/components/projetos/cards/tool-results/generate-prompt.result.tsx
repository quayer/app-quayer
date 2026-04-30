"use client"

import * as React from "react"
import { Check, ChevronDown, ChevronUp, FileText, Pencil } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { useChatActions } from "../../chat/chat-action-context"
import { safeGet } from "./index"

interface GeneratePromptResultProps {
  result: unknown
  tokens: AppTokens
}

/**
 * GeneratePromptResult — rich card for `generate_prompt_anatomy`.
 *
 * Shows the generated prompt (collapsible) + "Aprovado / Ajustes" CTAs
 * so the user can confirm or request changes before the builder proceeds.
 */
export function GeneratePromptResult({
  result,
  tokens,
}: GeneratePromptResultProps) {
  const actions = useChatActions()
  const [decided, setDecided] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)

  const prompt = safeGet<string>(result, "prompt") ?? ""
  const charCount = prompt.length
  const preview = charCount > 280 && !expanded ? prompt.slice(0, 280) + "…" : prompt

  const handleApprove = React.useCallback(() => {
    if (decided || !actions || actions.isStreaming) return
    setDecided(true)
    actions.sendMessage("Prompt aprovado, pode seguir.")
  }, [actions, decided])

  const handleAdjust = React.useCallback(() => {
    if (decided || !actions || actions.isStreaming) return
    setDecided(true)
    actions.sendMessage("Quero ajustar o prompt — ")
  }, [actions, decided])

  if (!prompt) return null

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
          className="flex items-center gap-2.5 px-4 py-2.5"
          style={{ backgroundColor: tokens.brandSubtle }}
        >
          <FileText className="h-4 w-4 shrink-0" style={{ color: tokens.brand }} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold" style={{ color: tokens.brandText }}>
              Prompt gerado
            </p>
            <p className="text-[11px]" style={{ color: tokens.brand, opacity: 0.7 }}>
              {charCount.toLocaleString("pt-BR")} caracteres
            </p>
          </div>
        </div>

        {/* Prompt body */}
        <div className="px-4 pt-3 pb-2">
          <pre
            className="whitespace-pre-wrap break-words text-[12px] leading-relaxed"
            style={{ color: tokens.textSecondary, fontFamily: "inherit" }}
          >
            {preview}
          </pre>
          {charCount > 280 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-2 flex items-center gap-1 text-[11px] font-medium"
              style={{ color: tokens.brandText }}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Ver menos
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Ver prompt completo
                </>
              )}
            </button>
          )}
        </div>

        {/* CTAs */}
        <div
          className="flex items-center gap-2 border-t px-4 py-3"
          style={{ borderColor: tokens.divider }}
        >
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-lg text-[13px] font-medium"
            style={{
              backgroundColor: decided ? tokens.hoverBg : tokens.brand,
              color: decided ? tokens.textTertiary : tokens.textInverse,
            }}
            onClick={handleApprove}
            disabled={decided}
          >
            <Check className="h-3.5 w-3.5" />
            Aprovado
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-lg text-[13px] font-medium"
            style={{
              borderColor: tokens.border,
              color: tokens.textSecondary,
            }}
            onClick={handleAdjust}
            disabled={decided}
          >
            <Pencil className="h-3.5 w-3.5" />
            Ajustes
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
