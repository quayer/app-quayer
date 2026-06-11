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
    contentRef,
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

  // Canonical BuilderState carregado junto do readiness. Fonte única do
  // prefill do picker E do slice de integração lido pelos cards inline (W2).
  const builderState = React.useMemo(() => {
    const candidate = (readiness as { builderState?: unknown } | undefined)
      ?.builderState
    return parseBuilderState(candidate)
  }, [readiness])

  // Prefill do ToolSelectionCard inline (reabrir mostra a decisão atual, não os
  // recommended).
  const toolSelectionPrefill = React.useMemo(
    () => ({
      selectedCapabilityKeys: builderState.selectedCapabilityKeys ?? [],
      selectedToolKeys: builderState.selectedToolKeys ?? [],
    }),
    [builderState],
  )

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Messages scrollable area — UM ÚNICO scroll: mensagens, streaming,
          erro E o active-step card vivem todos dentro deste container. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 md:px-6"
      >
        {/* Content wrapper observado pelo ResizeObserver de auto-scroll (em
            use-chat-stream): crescimento de CONTEÚDO (card montando, proposta
            chegando via poll, imagens carregando) re-ancora o fundo enquanto o
            usuário está pinado. min-h-full mantém o EmptyState centralizado. */}
        <div ref={contentRef} className="flex min-h-full flex-col">
          {isEmpty ? (
            <div className="flex flex-1 flex-col justify-center">
              <EmptyState tokens={tokens} />
            </div>
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
                  projectId={projectId}
                  builderState={builderState}
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
                  projectId={projectId}
                  builderState={builderState}
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

          {/* ───── Active-step card (driven by readiness) ─────
              ÚLTIMO item do fluxo da conversa, DENTRO do scroll de mensagens
              (feedback do founder: um único scroll). FR-17: o mesmo slot
              hospeda cards REABERTOS via "Ajustar" do resumo (reopenCard); a
              reabertura substitui o card do passo ativo até fechar (silencioso)
              ou re-submeter com sucesso. */}
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
        </div>
      </div>

      {/* ───── Composer (fixo, fora do scroll) ───── */}
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
