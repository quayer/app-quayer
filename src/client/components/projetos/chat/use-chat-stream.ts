"use client"

/**
 * useChatStream — conversation + streaming state for the Builder chat.
 *
 * Structural extraction from chat-panel.tsx (no behavior change): owns the
 * messages list, the SSE parser/consumer, sendMessage + submitCard (card-action
 * protocol), scroll/auto-scroll refs, the `builder:focus-chat` listener and the
 * auto-trigger of the initial message. ChatPanel renders from what this hook
 * returns.
 *
 * READINESS UNIFICADO (T49/T50, FR-18, plan §4.4): a query de readiness NÃO vive
 * mais aqui. O `workspace.tsx` é o dono ÚNICO da query (1 fetch) e injeta
 * `readiness` + `refetchReadiness` via {@link ReadinessContext}. Este hook só
 * CONSOME do contexto e mantém os triggers existentes (refetch em SSE finish e
 * pós-card-submit), que agora chamam o refetch içado — comportamento preservado.
 * Fora de um Provider o contexto degrada para `{ readiness: undefined, refetch
 * no-op }`, então o chat renderiza sem o card de passo ativo em vez de quebrar.
 */

import * as React from "react"

import type { CardKey } from "./cards/types"
import { fetchWithAuthRetry } from "@/lib/auth/client-refresh"
import type { Readiness } from "@/server/ai-module/builder/state/readiness.types"
import {
  parseBuilderState,
  type SourceProposal,
} from "@/server/ai-module/builder/cards/builder-state"

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function mergeSourceProposal(
  base: SourceProposal | undefined,
  edited: unknown,
): SourceProposal {
  if (!isRecord(edited)) return base ?? {}
  return {
    ...(base ?? {}),
    ...(typeof edited.businessName === "string"
      ? { businessName: edited.businessName }
      : {}),
    ...(Array.isArray(edited.services)
      ? { services: asStringArray(edited.services) }
      : {}),
    ...(typeof edited.audience === "string" ? { audience: edited.audience } : {}),
    ...(Array.isArray(edited.differentiators)
      ? { differentiators: asStringArray(edited.differentiators) }
      : {}),
    ...(typeof edited.tone === "string" ? { tone: edited.tone } : {}),
    ...(typeof edited.address === "string" ? { address: edited.address } : {}),
    ...(typeof edited.description === "string"
      ? { description: edited.description }
      : {}),
  }
}

function sourceReceipt(payload: Record<string, unknown>, readiness?: Readiness) {
  const state = parseBuilderState(
    (readiness as { builderState?: unknown } | undefined)?.builderState,
  )
  const accepted = mergeSourceProposal(
    state.sourceIngestion.proposed,
    payload.edited,
  )
  const parts: string[] = []
  if (accepted.businessName) parts.push(accepted.businessName)
  if (accepted.services?.length) {
    parts.push(
      `${accepted.services.length} ${accepted.services.length === 1 ? "serviço" : "serviços"}`,
    )
  }
  if (accepted.differentiators?.length) {
    parts.push(
      `${accepted.differentiators.length} diferenciais`,
    )
  }
  if (accepted.address) parts.push("endereço")
  if (accepted.description) parts.push("descrição")

  return parts.length > 0
    ? `Enviando ao agente: ${parts.join(" · ")}`
    : "Enviando dados do site ao agente"
}

function cardSubmitReceipt(
  cardKey: CardKey,
  payload: Record<string, unknown>,
  readiness?: Readiness,
): string | null {
  switch (cardKey) {
    case "source_progress":
      return sourceReceipt(payload, readiness)
    case "agent_review":
      return "Criando agente com a revisão final"
    case "business_hours":
      return "Enviando horário da equipe"
    case "services":
      return "Enviando escopo do atendimento"
    case "agent_persona":
      return "Enviando persona do agente"
    case "pricing":
      return "Enviando regras de preço"
    case "handoff":
      return "Enviando transferência para humano"
    default:
      return null
  }
}

/**
 * Hoisted-readiness contract shared between the SINGLE owner of the readiness
 * query (`workspace.tsx`) and its descendants (the chat via this hook, and the
 * preview Overview via the same context). FR-18: one source of truth, one fetch.
 *
 *  - `readiness`        : the latest step-engine snapshot (or `undefined` while
 *                         loading / on error — the chat then hides the active-step
 *                         card, honest degrade).
 *  - `refetchReadiness` : re-runs the hoisted query. The chat calls it on SSE
 *                         finish + after a card submit (the legacy triggers).
 */
export interface ReadinessContextValue {
  readiness: Readiness | undefined
  refetchReadiness: () => void
  readinessLoading: boolean
  readinessError: boolean
}

/**
 * Default value used when a consumer renders OUTSIDE the workspace's
 * `ReadinessContext.Provider` (defensive — same spirit as the old module-eval
 * no-op resolver). Keeps the chat rendering without the active-step card instead
 * of throwing. The real value is supplied by `workspace.tsx` (the single owner).
 */
const READINESS_CONTEXT_DEFAULT: ReadinessContextValue = {
  readiness: undefined,
  refetchReadiness: () => {},
  readinessLoading: false,
  readinessError: false,
}

/**
 * The hoisted-readiness context. `workspace.tsx` wraps the chat + preview in the
 * Provider with the value of its single `api.builder.getReadiness` query; the
 * chat (here) and the Overview read from it so there is exactly ONE fetch.
 */
export const ReadinessContext = React.createContext<ReadinessContextValue>(
  READINESS_CONTEXT_DEFAULT,
)

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
  const composerStorageKey = `builder:composer:${projectId}`

  // Notify parent on every messages change (lets PreviewPanel derive progress
  // from tool calls without owning the conversation).
  const onMessagesChangeRef = React.useRef(onMessagesChange)
  React.useEffect(() => {
    onMessagesChangeRef.current = onMessagesChange
  }, [onMessagesChange])
  React.useEffect(() => {
    onMessagesChangeRef.current?.(messages)
  }, [messages])
  const [input, setInput] = React.useState(() => {
    if (typeof window === "undefined") return ""
    return window.localStorage.getItem(composerStorageKey) ?? ""
  })
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
  /** Inner CONTENT wrapper (messages + active-step card) inside `scrollRef`.
   *  Observed by the ResizeObserver below: with the card rendered IN the
   *  conversation flow, content can grow without the viewport resizing. */
  const contentRef = React.useRef<HTMLDivElement | null>(null)
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

  // Re-anchor the bottom whenever the conversation CONTENT grows. The
  // active-step card renders INSIDE the scroll flow (single scroll — founder
  // feedback), so it mounting (readiness refetch on SSE finish), growing
  // (status poll delivering a proposal) or images loading change the CONTENT
  // height without resizing the viewport and without touching
  // [messages, streamingText, streamingToolCalls] — the deps-effect above
  // never fires for those. We observe BOTH the content wrapper (content
  // growth) and the scroll viewport (window/layout resizes shrink the visible
  // area). Only re-anchors while the user is already pinned to bottom —
  // scrolling up >100px flips `autoScrollRef` off (see handleScroll).
  React.useEffect(() => {
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      if (autoScrollRef.current) scrollToBottom()
    })
    if (scrollRef.current) observer.observe(scrollRef.current)
    if (contentRef.current) observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [scrollToBottom])

  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const trimmed = input.trim()
    if (trimmed) {
      window.localStorage.setItem(composerStorageKey, input)
    } else {
      window.localStorage.removeItem(composerStorageKey)
    }
  }, [composerStorageKey, input])

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
  // T49/T50 (FR-18): NÃO há query aqui. `readiness` + `refetchReadiness` vêm do
  // contexto içado (workspace = dono único da query, 1 fetch). Este hook só
  // CONSOME e drive o card de passo ativo no fim do fluxo da conversa. Os
  // triggers de invalidação (SSE finish + pós-card-submit) chamam o refetch
  // içado — comportamento preservado, agora sobre a fonte única.
  const { readiness, refetchReadiness } = React.useContext(ReadinessContext)

  // Keep a stable ref so the stream-consumer can invalidate readiness on finish
  // without re-creating its useCallback on every readiness change.
  const refetchReadinessRef = React.useRef(refetchReadiness)
  React.useEffect(() => {
    refetchReadinessRef.current = refetchReadiness
  }, [refetchReadiness])

  // ── Reopen de card confirmado (FR-17 — jornada-builder-v2) ─────
  // "Ajustar" no resumo final reabre o card da seção correspondente no slot do
  // fim do fluxo, pré-preenchido com o builderState ATUAL (a confirmação já era true
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
        if (response.status === 401) {
          throw new Error(
            "Sua sessão expirou. Entre de novo para continuar — o que você já fez está salvo.",
          )
        }
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
        const response = await fetchWithAuthRetry(
          `/api/v1/builder/projects/${projectId}/chat/message`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: trimmed, skipUserPersist }),
          },
          { notifyOnAuthFailure: true },
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
   * active-step card always re-resolves after a submit.
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
        const receipt = cardSubmitReceipt(cardKey, payload, readiness)
        if (receipt) {
          setMessages((prev) => [
            ...prev,
            {
              id: createId(),
              role: "system_banner" as const,
              content: receipt,
              createdAt: new Date().toISOString(),
            },
          ])
        }
        const response = await fetchWithAuthRetry(
          `/api/v1/builder/projects/${projectId}/cards/${cardKey}/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // The backend re-validates against the per-card schema; it expects
            // the cardKey discriminator IN the body alongside the owned slice.
            body: JSON.stringify({ cardKey, ...payload }),
          },
          { notifyOnAuthFailure: true },
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
    [consumeStream, isStreaming, projectId, readiness],
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

  React.useEffect(() => {
    const handleReopenCard = (event: Event) => {
      const detail = (event as CustomEvent<{ cardKey?: CardKey }>).detail
      if (!detail?.cardKey) return
      setReopenedCardKey(detail.cardKey)
    }

    window.addEventListener("builder:reopen-card", handleReopenCard)
    return () => window.removeEventListener("builder:reopen-card", handleReopenCard)
  }, [])

  // ── Capability toggle (FR-29, T45) ─────────────────────────────
  // A toggle flipped from the Overview's Capabilities surface persists via the
  // SILENT card-submit path (ackMode: 'silent') — NO chat POST, NO SSE, zero LLM
  // turn. The Overview dispatches a lightweight `builder:capability-toggled`
  // event with the local line text; we translate it into a `system_banner`
  // message in the LIVE history (the same cheap centered pill the server uses
  // for info lines) so the chat reflects the change with no reload. We also
  // refetch readiness so the journey/banner re-resolve off the persisted flip.
  React.useEffect(() => {
    const appendSystemBanner = (message: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: "system_banner" as const,
          content: message,
          createdAt: new Date().toISOString(),
        },
      ])
    }

    const handleCapabilityToggled = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail
      const line = detail?.message?.trim()
      if (!line) return
      appendSystemBanner(line)
      void refetchReadinessRef.current?.()
    }

    const handleLocalReceipt = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail
      const line = detail?.message?.trim()
      if (!line) return
      appendSystemBanner(line)
    }

    window.addEventListener("builder:capability-toggled", handleCapabilityToggled)
    window.addEventListener("builder:local-receipt", handleLocalReceipt)
    return () => {
      window.removeEventListener(
        "builder:capability-toggled",
        handleCapabilityToggled,
      )
      window.removeEventListener("builder:local-receipt", handleLocalReceipt)
    }
  }, [])

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
  }
}
