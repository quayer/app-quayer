"use client"

/**
 * Bolhas do Playground — extraídas do PlaygroundTab (FILE_SIZE_GUIDELINES).
 *
 * AssistantBubble renderiza o markdown da resposta + o status POR TOOL:
 * durante o streaming, uma tool só mostra "executando" enquanto o seu
 * `tool-result` não chegou — as demais aparecem como "concluído".
 */

import { Bot, Loader2, Wrench } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { Avatar, AvatarFallback } from "@/client/components/ui/avatar"
import { MarkdownContent } from "@/client/components/projetos/chat/markdown-content"

import type { PlaygroundToolCall } from "./use-playground-stream"

export function AssistantBubble({
  content,
  toolCalls,
  streaming,
  tokens,
}: {
  content: string
  toolCalls?: PlaygroundToolCall[]
  streaming?: boolean
  tokens: AppTokens
}) {
  return (
    <div className="flex items-start gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}>
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {content && (
          <>
            <MarkdownContent
              content={content}
              tokens={tokens}
              className="max-w-[95%]"
            />
            {streaming && (
              <span
                className="ml-0.5 inline-block animate-pulse"
                style={{ color: tokens.brand }}
                aria-hidden
              >
                ▊
              </span>
            )}
          </>
        )}
        {toolCalls && toolCalls.length > 0 && (
          <div className="flex flex-col gap-1">
            {toolCalls.map((tc, i) => {
              const pending = Boolean(streaming) && tc.result === undefined
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px]"
                  style={{ backgroundColor: tokens.bgSurface, color: tokens.textSecondary, border: `1px solid ${tokens.divider}` }}
                >
                  <Wrench className="h-3 w-3 shrink-0" style={{ color: tokens.brand }} />
                  <span className="font-mono" style={{ color: tokens.textPrimary }}>
                    {tc.toolName}
                  </span>
                  {pending ? (
                    <span className="flex items-center gap-1" style={{ color: tokens.textTertiary }}>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      executando
                    </span>
                  ) : (
                    <span style={{ color: tokens.textTertiary }}>concluído</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function EmptyState({ tokens }: { tokens: AppTokens }) {
  return (
    <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center gap-4 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}
      >
        <Bot className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-base font-semibold" style={{ color: tokens.textPrimary }}>
          Aguardando o Builder
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-[13px]" style={{ color: tokens.textSecondary }}>
          Continue a conversa no chat para o Builder criar seu agente.
        </p>
      </div>
    </div>
  )
}
