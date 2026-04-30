"use client"

import * as React from "react"
import { Check, Wrench } from "lucide-react"

import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { safeGet } from "./index"

interface AttachToolResultProps {
  result: unknown
  tokens: AppTokens
}

/**
 * Adapter + presentational card for `attach_tool_to_agent` tool result.
 */
export function AttachToolResult({ result, tokens }: AttachToolResultProps) {
  const toolKey = safeGet<string>(result, "toolKey") ?? ""
  const message = safeGet<string>(result, "message") ?? ""

  return (
    <ToolAttachedCard toolKey={toolKey} message={message} tokens={tokens} />
  )
}

function ToolAttachedCard({
  toolKey,
  tokens,
}: {
  toolKey: string
  message: string
  tokens: AppTokens
}) {
  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: "rgba(34,197,94,0.30)",
        borderRadius: "16px",
      }}
    >
      <CardContent className="flex items-center gap-3 px-4 py-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: "rgba(34,197,94,0.12)",
            color: "#22c55e",
          }}
        >
          <Wrench className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[13px] font-medium"
            style={{ color: tokens.textPrimary }}
          >
            Ferramenta adicionada
          </p>
          <p
            className="font-mono text-[11px]"
            style={{ color: tokens.textTertiary }}
          >
            {toolKey}
          </p>
        </div>
        <Check className="h-4 w-4 shrink-0" style={{ color: "#22c55e" }} />
      </CardContent>
    </Card>
  )
}
