"use client"

import * as React from "react"
import { AlertCircle, RefreshCw } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { MessageInput } from "@/client/components/ds/message-input"

import { ActiveStepCard } from "./active-step-card"
import { EmptyState, MessageBubble, StreamingBubble } from "./message-bubbles"
import { useChatStream } from "./use-chat-stream"
import { parseBuilderState } from "@/server/ai-module/builder/cards/builder-state"

import type { ChatMessage } from "../types"

interface ChatPanelProps {
  projectId: string
  initialMessages: ChatMessage[]
  /**
   * Reports the current messages list back to the parent so peer panels
   * (e.g. PreviewPanel) can derive progress from tool calls without
   * owning the conversation state.
   */
  onMessagesChange?: (messages: ChatMessage[]) => void
}

/**
 * ChatPanel — workspace chat com Builder AI.
 *
 * Visual: shadcn Avatar / Card / Collapsible + tokens reativos via
 * useAppTokens (mesma paleta da home + sidebar). Composer no rodapé
 * espelha o input da home (textarea + mic + send circular amber).
 *
 * Streaming: SSE parser custom mantido (backend não emite AI SDK
 * data stream protocol — usar useChat exigiria custom transport ou
 * refactor do backend; trade-off documentado). Conversa + streaming +
 * card-action protocol vivem em `useChatStream` (extração estrutural);
 * este componente só renderiza.
 */
export function ChatPanel({
  projectId,
  initialMessages,
  onMessagesChange,
}: ChatPanelProps) {
  const { tokens } = useAppTokens()

  const {
    messages,
    input,
    setInput,
    isStreaming,
    streamingText,
    streamingToolCalls,
    error,
    lastUserMessage,
    scrollRef,
    handleScroll,
    textareaRef,
    readiness,
    stableSubmitCard,
    handleCardDismiss,
    reopenedCardKey,
    reopenCard,
    closeReopenedCard,
    handleSubmit,
    handleRetry,
  } = useChatStream({ projectId, initialMessages, onMessagesChange })

  const isEmpty = messages.length === 0 && !streamingText && !error

  // Prefill do ToolSelectionCard inline (reabrir mostra a decisão atual, não os
  // recommended). Deriva do builderState carregado junto do readiness.
  const toolSelectionPrefill = React.useMemo(() => {
    const candidate = (readiness as { builderState?: unknown } | undefined)
      ?.builderState
    const parsed = parseBuilderState(candidate)
    return {
      selectedCapabilityKeys: parsed.selectedCapabilityKeys ?? [],
      selectedToolKeys: parsed.selectedToolKeys ?? [],
    }
  }, [readiness])

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Messages scrollable area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 md:px-6"
      >
        {isEmpty ? (
          <EmptyState tokens={tokens} />
        ) : (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                tokens={tokens}
                onDraft={setInput}
                onSubmitCard={stableSubmitCard}
                isStreaming={isStreaming}
                toolSelectionPrefill={toolSelectionPrefill}
              />
            ))}

            {/* Streaming assistant bubble */}
            {(streamingText || streamingToolCalls.length > 0) && (
              <StreamingBubble
                text={streamingText}
                toolCalls={streamingToolCalls}
                tokens={tokens}
                onDraft={setInput}
                onSubmitCard={stableSubmitCard}
                toolSelectionPrefill={toolSelectionPrefill}
              />
            )}

            {/* Inline error */}
            {error && (
              <div
                className="flex items-start gap-3 rounded-lg border p-3"
                style={{
                  borderColor: tokens.danger,
                  backgroundColor: tokens.dangerSubtle,
                }}
                role="alert"
              >
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: tokens.dangerText }}
                />
                <div className="flex-1 text-[13px]" style={{ color: tokens.textPrimary }}>
                  <p className="font-medium">{error}</p>
                  {lastUserMessage && (
                    <Button
                      type="button"
                      onClick={handleRetry}
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 gap-1.5 text-[11px]"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Tentar novamente
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ───── Pinned active-step card (driven by readiness) ─────
          FR-17: o mesmo slot hospeda cards REABERTOS via "Ajustar" do resumo
          (reopenCard); a reabertura substitui o card do passo ativo até fechar
          (silencioso) ou re-submeter com sucesso. */}
      <ActiveStepCard
        projectId={projectId}
        readiness={readiness}
        disabled={isStreaming}
        onSubmit={stableSubmitCard}
        onDismiss={handleCardDismiss}
        reopenedCardKey={reopenedCardKey}
        onAdjust={reopenCard}
        onCloseReopened={closeReopenedCard}
        tokens={tokens}
      />

      {/* ───── Composer ───── */}
      <div className="px-4 pb-4 pt-2 md:px-6">
        <div className="mx-auto w-full max-w-2xl">
          <MessageInput
            value={input}
            onChange={setInput}
            onSend={handleSubmit}
            disabled={isStreaming}
            placeholder="Continue a conversa com o Builder…"
            rows={2}
            tokens={tokens}
            textareaRef={textareaRef}
            voiceEnabled
            voiceLang="pt-BR"
          />
        </div>
      </div>
    </div>
  )
}
