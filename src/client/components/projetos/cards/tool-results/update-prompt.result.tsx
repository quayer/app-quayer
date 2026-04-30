"use client"

import * as React from "react"
import { FileText } from "lucide-react"

import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { safeGet } from "./index"

interface UpdatePromptResultProps {
  result: unknown
  tokens: AppTokens
}

/**
 * Renders the `update_agent_prompt` tool result — a new draft version
 * of the agent's prompt (not yet published).
 *
 * Shape (see src/server/ai-module/builder/tools/update-agent-prompt.tool.ts):
 *   success: true
 *   versionNumber: number
 *   versionId: string
 *   description: string | null
 *   message: string
 */
export function UpdatePromptResult({ result, tokens }: UpdatePromptResultProps) {
  const versionNumber = safeGet<number>(result, "versionNumber")
  const description = safeGet<string | null>(result, "description") ?? null
  const message =
    safeGet<string>(result, "message") ?? "Nova versao de prompt criada"

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
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[14px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              Prompt atualizado
              {versionNumber != null ? ` (v${versionNumber})` : ""}
            </p>
            <p
              className="text-[11px]"
              style={{ color: tokens.textTertiary }}
            >
              Rascunho criado — ainda nao publicado
            </p>
          </div>
        </div>
        {(description || message) && (
          <div className="px-4 py-2.5">
            {description && (
              <p
                className="text-[12px]"
                style={{ color: tokens.textSecondary }}
              >
                {description}
              </p>
            )}
            {!description && message && (
              <p
                className="text-[12px]"
                style={{ color: tokens.textSecondary }}
              >
                {message}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
