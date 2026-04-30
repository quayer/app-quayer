"use client"

import * as React from "react"
import { ChevronDown, Loader2, Wrench } from "lucide-react"

import { Card } from "@/client/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/client/components/ui/collapsible"
import type { useAppTokens } from "@/client/hooks/use-app-tokens"

import { ToolResultCard } from "../cards"
import { getStreamingSkeleton } from "../cards/tool-skeletons"
import type { ToolCallView } from "./hooks/use-chat-stream"

type Tokens = ReturnType<typeof useAppTokens>["tokens"]

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** Tool names that get a rich card rendered directly (not inside a collapsible). */
export const RICH_CARD_TOOLS = new Set([
  "create_agent",
  "list_whatsapp_instances",
  "create_whatsapp_instance",
  "generate_prompt_anatomy",
  "publish_agent",
  "get_agent_status",
  "attach_tool_to_agent",
  "select_channel",
  "propose_agent_creation",
  "run_prompt_preview",
  "adjust_prompt_tone",
  "propose_tool_selection",
  "propose_plan_upgrade",
  "instagram_setup_wizard",
])

interface ToolCallCardProps {
  toolName: string
  args: unknown
  result?: unknown
  tokens: Tokens
  streaming?: boolean
}

export function ToolCallCard({
  toolName,
  args,
  result,
  tokens,
  streaming = false,
}: ToolCallCardProps) {
  const hasRichCard = result !== undefined && RICH_CARD_TOOLS.has(toolName)

  if (streaming && result === undefined) {
    const skeleton = getStreamingSkeleton(toolName, tokens)
    if (skeleton) return skeleton
  }

  if (streaming || !hasRichCard) {
    return (
      <Collapsible>
        <Card
          className="border p-0 shadow-none"
          style={{
            backgroundColor: tokens.bgSurface,
            borderColor: tokens.divider,
            borderRadius: "12px",
          }}
        >
          <CollapsibleTrigger
            className="group flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors"
            style={{ color: tokens.textSecondary }}
          >
            <Wrench
              className="h-3 w-3 shrink-0"
              style={{ color: tokens.brand }}
            />
            <span className="font-mono" style={{ color: tokens.textPrimary }}>
              {toolName}
            </span>
            {streaming ? (
              <span
                className="flex items-center gap-1"
                style={{ color: tokens.textTertiary }}
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                executando
              </span>
            ) : (
              <span style={{ color: tokens.textTertiary }}>concluido</span>
            )}
            <ChevronDown
              className="ml-auto h-3 w-3 transition-transform group-data-[state=open]:rotate-180"
              style={{ color: tokens.textTertiary }}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div
              className="border-t px-3 py-2"
              style={{ borderColor: tokens.divider }}
            >
              {result !== undefined ? (
                <ToolResultCard
                  toolName={toolName}
                  args={args}
                  result={result}
                  tokens={tokens}
                />
              ) : (
                <>
                  <div
                    className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: tokens.textTertiary }}
                  >
                    Argumentos
                  </div>
                  <pre
                    className="overflow-x-auto rounded-lg p-2 text-[11px]"
                    style={{
                      backgroundColor: tokens.bgBase,
                      color: tokens.textSecondary,
                    }}
                  >
                    {prettyJson(args)}
                  </pre>
                </>
              )}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    )
  }

  return (
    <ToolResultCard
      toolName={toolName}
      args={args}
      result={result}
      tokens={tokens}
    />
  )
}
