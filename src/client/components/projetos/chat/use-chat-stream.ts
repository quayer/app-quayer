"use client"

/**
 * useChatStream — conversation + streaming state for the Builder chat.
 *
 * Structural extraction from chat-panel.tsx (no behavior change): owns the
 * messages list, the SSE parser/consumer, sendMessage + submitCard (card-action
 * protocol), the readiness query, scroll/auto-scroll refs, the
 * `builder:focus-chat` listener and the auto-trigger of the initial message.
 * ChatPanel renders from what this hook returns.
 */

import * as React from "react"

import { api } from "@/igniter.client"

import type { CardKey } from "./cards/types"
import type { Readiness } from "@/server/ai-module/builder/state/readiness.types"

import type { ChatMessage } from "../types"

type ServerEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolName: string; args: Record<string, unknown> }
  | { type: "tool-result"; toolName: string; result: unknown }
  | {
      type: "finish"
      toolCalls?: Array<{
        toolName: string
        args: Record<string, unknown>
        result: unknown
      }>
    }
  | { type: "error"; message: string }

export interface ToolCallView {
  toolName: string
  args: unknown
  result?: unknown
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Minimal structural view of the auto-generated `api.builder.getReadiness`
 * query hook. The generated client (`igniter.schema.ts`) now exposes this action
 * (`builder.getReadiness` → `GET /projects/:id/readiness`), so the cast that
 * used to bridge a missing action is no longer required. We keep this structural
 * type as the call contract and a defensive resolver ({@link READINESS_QUERY})
 * so a regenerate that ever drops the action degrades to a no-op hook instead of
 * crashing at module-eval. The server returns `{ success, data: Readiness }`
 * (see chat.routes.ts `getReadinessAction`).
 */
interface GetReadinessQuery {
  useQuery: (opts: { params: { id: string } }) => {
    data: { success?: boolean; data?: Readiness } | undefined
    refetch: () => unknown
  }
}

/**
 * Resolve the readiness query hook off the typed client with a defensive guard,
 * ONCE at module-eval. The typed client now resolves `api.builder.getReadiness`
 * directly (no `as unknown as` cast needed); if a future regenerate ever drops
 * the action we fall back to a stable no-op hook
 * (`{ data: undefined, refetch: () => {} }`) so the panel renders without the
 * active-step card rather than throwing.
 *
 * Resolving once (module scope, not per-render) keeps the chosen hook IDENTITY
 * stable across renders — the Rules-of-Hooks contract holds because the same
 * `useQuery` function is invoked unconditionally on every render.
 */
const READINESS_QUERY: GetReadinessQuery = (() => {
  const candidate = (api.builder as { getReadiness?: unknown }).getReadiness
  if (
    candidate &&
    typeof (candidate as { useQuery?: unknown }).useQuery === "function"
  ) {
    return candidate as GetReadinessQuery
  }
  return {
    useQuery: () => ({ data: undefined, refetch: () => {} }),
  }
})()

export interface UseChatStreamOptions {
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
 * Streaming: SSE parser custom mantido (backend não emite AI SDK
 * data stream protocol — usar useChat exigiria custom transport ou
 * refactor do backend; trade-off documentado).
 */
export function useChatStream({
  projectId,
  initialMessages,
  onMessagesChange,
}: UseChatStreamOptions) {
  // ── State ──────────────────────────────────────────────────────
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages)

  // Notify parent on every messages change (lets PreviewPanel derive progress
  // from tool calls without owning the conversation).
  const onMessagesChangeRef = React.useRef(onMessagesChange)
  React.useEffect(() => {
    onMessagesChangeRef.current = onMessagesChange
  }, [onMessagesChange])
  React.useEffect(() => {
    onMessagesChangeRef.current?.(messages)
  }, [messages])
  const [input, setInput] = React.useState("")
  const [isStreaming, setIsStreaming] = React.useState(false)
  const [streamingText, setStreamingText] = React.useState("")
  const [streamingToolCalls, setStreamingToolCalls] = React.useState<
    ToolCallView[]
  >([])
  const [error, setError] = React.useState<string | null>(null)
  const [lastUserMessage, setLastUserMessage] = React.useState<string | null>(
    null,
  )

  // ── Refs / scroll ──────────────────────────────────────────────
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const autoScrollRef = React.useRef(true)

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    autoScrollRef.current =
      el.scrollHeight - (el.scrollTop + el.clientHeight) < 100
  }, [])

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  React.useEffect(() => {
    if (autoScrollRef.current) scrollToBottom()
  }, [messages, streamingText, streamingToolCalls, scrollToBottom])

  React.useEffect(() => {
    scrollToBottom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-anchor the bottom whenever the scroll VIEWPORT itself resizes — e.g. the
  // pinned active-step card mounting (readiness refetch on SSE finish) or
  // growing (status poll) shrinks the flex-1 messages area without touching
  // [messages, streamingText, streamingToolCalls], so the deps-effect above
  // never fires. Only re-anchors while the user is already pinned to bottom.
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      if (autoScrollRef.current) scrollToBottom()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollToBottom])

  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // ── SSE parser (preserved) ─────────────────────────────────────
  const parseSseBuffer = React.useCallback(
    (buffer: string): { events: ServerEvent[]; rest: string } => {
      const events: ServerEvent[] = []
      const parts = buffer.split("\n\n")
      const rest = parts.pop() ?? ""
      for (const raw of parts) {
        if (!raw.trim()) continue
        const dataLines: string[] = []
        for (const line of raw.split("\n")) {
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart())
        }
        if (dataLines.length === 0) continue
        const payload = dataLines.join("\n")
        try {
          events.push(JSON.parse(payload) as ServerEvent)
        } catch (err) {
          console.error("[chat-panel] SSE parse failed", err, payload)
        }
      }
      return { events, rest }
    },
    [],
  )

  // ── Readiness (deterministic step-engine — single source of truth) ──
  // Drives the pinned active-step card below the conversation. Invalidated on
  // SSE finish + after a card submit (no polling — per the spec).
  const { data: readinessEnvelope, refetch: refetchReadiness } =
    READINESS_QUERY.useQuery({ params: { id: projectId } })
  const readiness = readinessEnvelope?.data

  // Keep a stable ref so the stream-consumer can invalidate readiness on finish
  // without re-creating its useCallback on every readiness change.
  const refetchReadinessRef = React.useRef(refetchReadiness)
  React.useEffect(() => {
    refetchReadinessRef.current = refetchReadiness
  }, [refetchReadiness])

  // ── Reopen de card confirmado (FR-17 — jornada-builder-v2) ─────
  // "Ajustar" no resumo final reabre o card da seção correspondente no slot
  // pinado, pré-preenchido com o builderState ATUAL (a confirmação já era true
  // e continua true após o re-submit — o step-engine não muda). Fechar a
  // reabertura NUNCA envia mensagem ao chat: só limpa este estado.
  const [reopenedCardKey, setReopenedCardKey] =
    React.useState<CardKey | null>(null)

  const reopenCard = React.useCallback((cardKey: CardKey) => {
    setReopenedCardKey(cardKey)
  }, [])

  const closeReopenedCard = React.useCallback(() => {
    setReopenedCardKey(null)
  }, [])

  /**
   * Consume the SSE body of a chat/card POST: drains the reader, accumulates
   * text + tool calls, and on `finish` pushes the assistant message + flips the
   * readiness query stale (so the active-step card advances). Shared by BOTH
   * sendMessage and submitCard so the ACK turn streams identically. Throws on
   * a non-ok / bodyless response so the caller's try/catch surfaces the error.
   */
  const consumeStream = React.useCallback(
    async (response: Response, fallbackErr: string) => {
      if (!response.ok || !response.body) {
        throw new Error(`${fallbackErr} (HTTP ${response.status})`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let finished = false
      let accText = ""
      const toolCalls: ToolCallView[] = []

      while (!finished) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { events, rest } = parseSseBuffer(buffer)
        buffer = rest

        for (const event of events) {
          if (event.type === "text-delta") {
            accText += event.text
            setStreamingText(accText)
          } else if (event.type === "tool-call") {
            toolCalls.push({ toolName: event.toolName, args: event.args })
            setStreamingToolCalls([...toolCalls])
          } else if (event.type === "tool-result") {
            for (let i = toolCalls.length - 1; i >= 0; i--) {
              if (
                toolCalls[i]!.toolName === event.toolName &&
                toolCalls[i]!.result === undefined
              ) {
                toolCalls[i] = { ...toolCalls[i]!, result: event.result }
                break
              }
            }
            setStreamingToolCalls([...toolCalls])
          } else if (event.type === "finish") {
            const finalToolCalls =
              event.toolCalls && event.toolCalls.length > 0
                ? event.toolCalls
                : toolCalls
            const assistantMessage: ChatMessage = {
              id: createId(),
              role: "assistant",
              content: accText,
              toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
              createdAt: new Date().toISOString(),
            }
            setMessages((prev) => [...prev, assistantMessage])
            setStreamingText("")
            setStreamingToolCalls([])
            finished = true
            // Step-engine state may have advanced this turn — refresh readiness.
            void refetchReadinessRef.current?.()
          } else if (event.type === "error") {
            setError(event.message || "Erro ao processar mensagem")
            finished = true
          }
          if (finished) break
        }
      }
    },
    [parseSseBuffer],
  )

  // ── Send ───────────────────────────────────────────────────────
  const sendMessage = React.useCallback(
    async (content: string, skipUserPersist = false) => {
      const trimmed = content.trim()
      if (!trimmed || isStreaming) return

      setError(null)
      setLastUserMessage(trimmed)
      autoScrollRef.current = true

      if (!skipUserPersist) {
        // Normal path: optimistically add user message to UI and clear input.
        setMessages((prev) => [
          ...prev,
          {
            id: createId(),
            role: "user" as const,
            content: trimmed,
            createdAt: new Date().toISOString(),
          },
        ])
        setInput("")
      }

      setIsStreaming(true)
      setStreamingText("")
      setStreamingToolCalls([])

      try {
        const response = await fetch(
          `/api/v1/builder/projects/${projectId}/chat/message`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: trimmed, skipUserPersist }),
          },
        )
        await consumeStream(response, "Falha ao enviar mensagem")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
      } finally {
        setIsStreaming(false)
      }
    },
    [consumeStream, isStreaming, projectId],
  )

  /**
   * Submit a card payload through the card-action protocol. POSTs to
   * `/builder/projects/:id/cards/:cardKey/submit` and consumes the SAME SSE
   * stream as chat (via {@link consumeStream}) so the deterministic ACK turn —
   * the meta-agent acknowledging the card + advancing the journey — streams
   * straight into the message list.
   *
   * Cards emit ONLY their owned slice; the backend body is discriminated on
   * `cardKey`, so we merge `{ cardKey, ...payload }` before POSTing (matches the
   * `cardSubmitBodySchema` discriminated union). Readiness is invalidated on
   * SSE finish (inside consumeStream) AND defensively here in finally — so the
   * pinned active-step card always re-resolves after a submit.
   */
  const submitCard = React.useCallback(
    async (cardKey: CardKey, payload: Record<string, unknown>) => {
      if (isStreaming) return

      setError(null)
      autoScrollRef.current = true
      setIsStreaming(true)
      setStreamingText("")
      setStreamingToolCalls([])

      try {
        const response = await fetch(
          `/api/v1/builder/projects/${projectId}/cards/${cardKey}/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // The backend re-validates against the per-card schema; it expects
            // the cardKey discriminator IN the body alongside the owned slice.
            body: JSON.stringify({ cardKey, ...payload }),
          },
        )
        await consumeStream(response, "Falha ao enviar card")
        // FR-17: um re-submit bem-sucedido do card REABERTO fecha a reabertura
        // (submits de outros cards não tocam nela; erro mantém aberto p/ retry).
        setReopenedCardKey((prev) => (prev === cardKey ? null : prev))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
      } finally {
        setIsStreaming(false)
        // Belt-and-suspenders: ensure readiness re-resolves even if the stream
        // ended without a clean `finish` event.
        void refetchReadinessRef.current?.()
      }
    },
    [consumeStream, isStreaming, projectId],
  )

  // Keep `submitCard` in a ref (mirroring `refetchReadinessRef`) so the card
  // `onSubmit` identity stays STABLE across renders. `submitCard` itself is a
  // useCallback that re-creates whenever `isStreaming` toggles; cards (e.g.
  // CalendarConnectCard) put `onSubmit` in an effect dependency array, so an
  // unstable identity re-runs those effects on every stream toggle. The ref +
  // stable wrapper below decouple the card-facing identity from those deps.
  const submitCardRef = React.useRef(submitCard)
  React.useEffect(() => {
    submitCardRef.current = submitCard
  }, [submitCard])

  // Stable, never-changing wrapper handed to ActiveStepCard. Its identity is
  // constant for the component's lifetime ([] deps) — it always dispatches to
  // the LATEST `submitCard` via the ref.
  const stableSubmitCard = React.useCallback(
    (cardKey: CardKey, payload: Record<string, unknown>) => {
      void submitCardRef.current(cardKey, payload)
    },
    [],
  )

  // Card "skip / Agora não" affordance: a lightweight free-text chat turn so the
  // meta-agent can acknowledge the skip and re-orient the journey. Cards expose
  // this via `onDismiss`; without it the skip button never renders. We route it
  // through `sendMessage` (NOT a card submit) so no confirmation sentinel flips.
  const handleCardDismiss = React.useCallback(() => {
    void sendMessage("Pular este passo por agora.")
  }, [sendMessage])

  React.useEffect(() => {
    const handleFocusChat = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; autoSend?: boolean }>).detail
      const message = detail?.message?.trim()
      if (!message) {
        textareaRef.current?.focus()
        return
      }

      if (detail?.autoSend) {
        void sendMessage(message)
        return
      }

      setInput(message)
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus()
        const length = textareaRef.current?.value.length ?? 0
        textareaRef.current?.setSelectionRange(length, length)
      })
    }

    window.addEventListener("builder:focus-chat", handleFocusChat)
    return () => window.removeEventListener("builder:focus-chat", handleFocusChat)
  }, [sendMessage])

  // ── Auto-trigger initial message ───────────────────────────────
  // When a project is first created, the initial prompt is persisted as a
  // user message by createProject. On mount, if the last loaded message is
  // unanswered (role === 'user'), trigger the AI response automatically.
  const autoTriggeredRef = React.useRef(false)
  React.useEffect(() => {
    if (autoTriggeredRef.current) return
    const last = initialMessages[initialMessages.length - 1]
    if (last?.role === "user") {
      autoTriggeredRef.current = true
      void sendMessage(last.content, true)
    }
    // sendMessage is stable (useCallback with deps), safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = React.useCallback(
    () => void sendMessage(input),
    [input, sendMessage],
  )

  const handleRetry = React.useCallback(() => {
    if (!lastUserMessage) return
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i]!.role === "user" && prev[i]!.content === lastUserMessage) {
          return prev.slice(0, i)
        }
      }
      return prev
    })
    void sendMessage(lastUserMessage)
  }, [lastUserMessage, sendMessage])

  return {
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
  }
}
