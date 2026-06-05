"use client"

import * as React from "react"
import Image from "next/image"
import {
  AlertCircle,
  Bell,
  Bot,
  Calendar,
  Check,
  Headphones,
  ImageIcon,
  Info,
  Instagram,
  Keyboard,
  Languages,
  Loader2,
  MessageCircle,
  Mic,
  Pencil,
  QrCode,
  RefreshCw,
  Sparkles,
  Tag,
  Timer,
  User,
  UserPlus,
  Volume2,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/client/components/ui/avatar"
import { Button } from "@/client/components/ui/button"
import { Card } from "@/client/components/ui/card"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { MessageInput } from "@/client/components/ds/message-input"
import { api } from "@/igniter.client"
import { MarkdownContent } from "./markdown-content"

import { getCardForStep } from "./cards/card-registry"
import { parseBuilderState } from "@/server/ai-module/builder/cards/builder-state"
import type { BuilderState } from "@/server/ai-module/builder/cards/builder-state"
import type { CardKey } from "./cards/types"
import type { Readiness, StepId } from "@/server/ai-module/builder/state/readiness.types"

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

interface ToolCallView {
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
 * type as the call contract and a defensive resolver ({@link resolveReadinessQuery})
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

/**
 * The canonical BuilderState the active-step card pre-fills from. The readiness
 * endpoint (`getReadiness`) returns the persisted `builderState`; we run it
 * through the dependency-free `parseBuilderState` (never throws) which backfills
 * a fully-defaulted state when it's missing (legacy rows) or malformed.
 */
function resolveBuilderState(readiness: Readiness | undefined): BuilderState {
  const candidate = (readiness as { builderState?: unknown } | undefined)
    ?.builderState
  return parseBuilderState(candidate)
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
 * refactor do backend; trade-off documentado).
 */
export function ChatPanel({
  projectId,
  initialMessages,
  onMessagesChange,
}: ChatPanelProps) {
  const { tokens } = useAppTokens()

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

  const isEmpty = messages.length === 0 && !streamingText && !error

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

      {/* ───── Pinned active-step card (driven by readiness) ───── */}
      <ActiveStepCard
        projectId={projectId}
        readiness={readiness}
        disabled={isStreaming}
        onSubmit={stableSubmitCard}
        onDismiss={handleCardDismiss}
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

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

/**
 * ActiveStepCard — the pinned slot that renders the card for the CURRENT
 * journey step, driven by the deterministic readiness snapshot. It maps
 * `readiness.step.id` (a StepId) onto a registered W3 card via `getCardForStep`
 * and renders it with the canonical BuilderState (`value`), wiring its
 * `onSubmit` to chat-panel's `submitCard(cardKey, payload)` (which owns POST +
 * SSE). Renders nothing when the step has no card (free-text steps like
 * `project_identity`/`objective`, or legacy steps still served inline by
 * ToolCallCard: tools/channel/agent_approval).
 *
 * The card payload is typed per-card; the registry stores components as
 * `CardComponentProps<unknown>`, so the bound `onSubmit` accepts the card's
 * payload as `unknown` and forwards it untouched (the backend re-validates).
 */
function ActiveStepCard({
  projectId,
  readiness,
  disabled,
  onSubmit,
  onDismiss,
  tokens,
}: {
  projectId: string
  readiness: Readiness | undefined
  disabled: boolean
  onSubmit: (cardKey: CardKey, payload: Record<string, unknown>) => void
  /** Skip affordance ("Agora não"/"Ajustar") — forwarded to every card so the
   *  dismiss button actually renders. Routes to a lightweight chat turn. */
  onDismiss: () => void
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  const stepId = readiness?.step.id as StepId | undefined
  const descriptor = stepId ? getCardForStep(stepId) : undefined

  // Bind this card's onSubmit to its cardKey so the card can stay payload-only.
  const handleSubmit = React.useCallback(
    (payload: unknown) => {
      if (!descriptor) return
      onSubmit(
        descriptor.cardKey,
        (payload ?? {}) as Record<string, unknown>,
      )
    },
    [descriptor, onSubmit],
  )

  if (!descriptor) return null

  const CardComponent = descriptor.component
  const value = resolveBuilderState(readiness)

  return (
    <div className="px-4 pb-1 pt-2 md:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <CardComponent
          projectId={projectId}
          cardKey={descriptor.cardKey}
          value={value}
          disabled={disabled}
          onSubmit={handleSubmit}
          onDismiss={onDismiss}
          tokens={tokens}
        />
      </div>
    </div>
  )
}

function EmptyState({
  tokens,
}: {
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: tokens.brandSubtle,
          color: tokens.brand,
        }}
      >
        <Bot className="h-6 w-6" />
      </div>
      <h3
        className="text-base font-semibold"
        style={{ color: tokens.textPrimary }}
      >
        Pronto para construir
      </h3>
      <p
        className="max-w-sm text-[13px]"
        style={{ color: tokens.textSecondary }}
      >
        Converse com o Builder pra criar, editar e publicar seu agente de
        WhatsApp.
      </p>
    </div>
  )
}

function MessageBubble({
  message,
  tokens,
  onDraft,
  onSubmitCard,
  isStreaming = false,
}: {
  message: ChatMessage
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  /** Pre-fill the composer (the "Ajustar" free-form draft path). */
  onDraft: (content: string) => void
  /** Card-action protocol submit — legacy inline cards (agent_approval /
   *  tool_selection / channel) flip their deterministic sentinel through this
   *  instead of posting free text. */
  onSubmitCard: (cardKey: CardKey, payload: Record<string, unknown>) => void
  /** Global chat streaming state — disables interactive cards mid-send. */
  isStreaming?: boolean
}) {
  if (message.role === "user") {
    return (
      <div className="flex flex-row-reverse items-start gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback
            style={{
              backgroundColor: tokens.brand,
              color: tokens.textInverse,
            }}
          >
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <Card
          className="max-w-[85%] border-0 px-4 py-2.5 text-[14px] leading-relaxed shadow-none"
          style={{
            backgroundColor: tokens.brand,
            color: tokens.textInverse,
            borderRadius: "16px 16px 4px 16px",
          }}
        >
          {message.content}
        </Card>
      </div>
    )
  }

  if (message.role === "system_banner") {
    return (
      <div
        className="mx-auto rounded-full px-3 py-1 text-center text-[11px]"
        style={{
          backgroundColor: tokens.hoverBg,
          color: tokens.textTertiary,
        }}
      >
        {message.content}
      </div>
    )
  }

  // assistant
  return (
    <div className="flex items-start gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {message.content && (
          <MarkdownContent content={message.content} className="max-w-[95%]" tokens={tokens} />
        )}
        {message.toolCalls?.map((tc, i) => (
          <ToolCallCard
            key={`${message.id}-tc-${i}`}
            toolName={tc.toolName}
            args={tc.args}
            result={tc.result}
            tokens={tokens}
            isStreaming={isStreaming}
            onDraft={onDraft}
            onSubmitCard={onSubmitCard}
          />
        ))}
      </div>
    </div>
  )
}

function StreamingBubble({
  text,
  toolCalls,
  tokens,
  onDraft,
  onSubmitCard,
}: {
  text: string
  toolCalls: ToolCallView[]
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  /** Pre-fill the composer (the "Ajustar" free-form draft path). */
  onDraft: (content: string) => void
  /** Card-action protocol submit — see MessageBubble. */
  onSubmitCard: (cardKey: CardKey, payload: Record<string, unknown>) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {text && (
          <div className="relative max-w-[95%]">
            <MarkdownContent content={text} tokens={tokens} />
            <span
              className="ml-0.5 inline-block animate-pulse"
              style={{ color: tokens.brand }}
              aria-hidden
            >
              ▊
            </span>
          </div>
        )}
        {toolCalls.map((tc, i) => (
          <ToolCallCard
            key={`stream-tc-${i}`}
            toolName={tc.toolName}
            args={tc.args}
            result={tc.result}
            tokens={tokens}
            streaming={tc.result === undefined}
            isStreaming
            onDraft={onDraft}
            onSubmitCard={onSubmitCard}
          />
        ))}
      </div>
    </div>
  )
}

// Human-readable labels for builder tool names.
const TOOL_LABELS: Record<string, string> = {
  generate_prompt_anatomy:   "Gerando prompt",
  propose_agent_creation:    "Propondo agente",
  propose_tool_selection:    "Escolhendo capacidades",
  create_agent:              "Criando agente",
  update_agent:              "Atualizando agente",
  select_channel:            "Escolhendo canal",
  list_whatsapp_instances:   "Buscando canais WhatsApp",
  create_whatsapp_instance:  "Criando conexão WhatsApp",
  connect_whatsapp_instance: "Conectando WhatsApp",
  deploy_agent:              "Publicando agente",
  validate_prompt:           "Validando prompt",
  get_project_status:        "Verificando status",
  transfer_to_human:         "Transferindo para humano",
  schedule_appointment:      "Agendando reunião",
  create_lead:               "Registrando lead",
}

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ")
}

// Extract a short human-readable summary from tool result.
// Shows only the message/error field — never the full payload.
function toolResultSummary(result: unknown): string | null {
  if (!result || typeof result !== "object") return null
  const r = result as Record<string, unknown>
  if (typeof r.message === "string" && r.message) return r.message
  if (typeof r.error === "string" && r.error) return `Erro: ${r.error}`
  if (r.success === false) return "Falha na operação"
  return null
}

function getStringField(value: unknown, field: string): string | null {
  if (!value || typeof value !== "object") return null
  const raw = (value as Record<string, unknown>)[field]
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}

function getAgentProposal(args: unknown, result: unknown) {
  return {
    name:
      getStringField(result, "proposedName") ??
      getStringField(args, "name") ??
      "Novo agente",
    description:
      getStringField(result, "proposedDescription") ??
      getStringField(args, "description") ??
      "Revise a proposta e confirme para criar o agente.",
  }
}

interface ToolSelectionEntry {
  key: string
  title: string
  description: string
  toolKeys: string[]
  icon?: string
  recommended?: boolean
  note?: string
}

function getToolSelection(result: unknown) {
  if (!result || typeof result !== "object") return null
  const r = result as Record<string, unknown>
  const rawTools = Array.isArray(r.tools) ? r.tools : []
  const tools = rawTools
    .map((item): ToolSelectionEntry | null => {
      if (!item || typeof item !== "object") return null
      const raw = item as Record<string, unknown>
      const key = typeof raw.key === "string" ? raw.key : null
      const title = typeof raw.title === "string" ? raw.title : null
      const description =
        typeof raw.description === "string" ? raw.description : null
      if (!key || !title || !description) return null
      return {
        key,
        title,
        description,
        toolKeys: Array.isArray(raw.toolKeys)
          ? raw.toolKeys.filter((value): value is string => typeof value === "string")
          : [key],
        icon: typeof raw.icon === "string" ? raw.icon : undefined,
        recommended: raw.recommended === true,
        note: typeof raw.note === "string" ? raw.note : undefined,
      }
    })
    .filter((item): item is ToolSelectionEntry => item !== null)

  if (tools.length === 0) return null

  return {
    agentId: getStringField(result, "agentId"),
    reason: getStringField(result, "reason"),
    tools,
  }
}

function ToolIcon({ icon }: { icon?: string }) {
  const className = "h-4 w-4"
  if (icon === "calendar") return <Calendar className={className} />
  if (icon === "tag") return <Tag className={className} />
  if (icon === "user-plus") return <UserPlus className={className} />
  if (icon === "headphones") return <Headphones className={className} />
  if (icon === "bell") return <Bell className={className} />
  return <Sparkles className={className} />
}

function toolHelpText(key: string): string {
  const help: Record<string, string> = {
    schedule_appointment:
      "Use quando o agente puder coletar intenção de agenda e organizar pedido de consulta. A disponibilidade real ainda depende das regras conectadas.",
    send_pricing:
      "Use quando fizer sentido registrar valores ou propostas enviadas. Para advocacia, evite preço automático se isso conflitar com sua regra comercial/OAB.",
    create_lead:
      "Use para marcar o contato como lead qualificado quando houver dados mínimos e interesse claro.",
    transfer_to_human:
      "No WhatsApp, a IA sinaliza a transferência e pausa ou encaminha a conversa conforme a integração. É ideal para casos sensíveis, dúvidas jurídicas ou pedido de advogado.",
    notify_team:
      "Envia um aviso interno sem necessariamente parar a IA. Útil para urgências ou oportunidades que precisam de atenção rápida.",
    qualified_handoff:
      "Ativa qualificação e transferência: a IA registra o lead, pausa a conversa e deixa um humano assumir no painel.",
    team_alert:
      "Cria um alerta interno. Enviar o resumo para outro WhatsApp ainda precisa de ferramenta custom por webhook.",
    appointment_intent:
      "Registra intenção de agenda para a equipe confirmar. Não consulta calendário real ainda.",
    pricing_log:
      "Registra valores enviados. Para advocacia, use apenas quando essa regra comercial estiver clara.",
    lead_only:
      "Marca o lead como qualificado, mas mantém a IA conversando.",
  }
  return help[key] ?? "Ativa uma capacidade operacional do agente."
}

function ToolSelectionCard({
  selection,
  tokens,
  onSubmitCard,
  disabled = false,
}: {
  selection: NonNullable<ReturnType<typeof getToolSelection>>
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  /** Card-action protocol submit — flips the `tool_selection` sentinel. */
  onSubmitCard: (cardKey: CardKey, payload: Record<string, unknown>) => void
  /** True while the assistant is streaming — blocks re-submitting the card. */
  disabled?: boolean
}) {
  const recommended = React.useMemo(
    () =>
      selection.tools
        .filter((tool) => tool.recommended)
        .map((tool) => tool.key),
    [selection.tools],
  )
  const [selected, setSelected] = React.useState<string[]>(recommended)

  const toggleTool = React.useCallback((key: string) => {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    )
  }, [])

  // Submit the typed payload via the card-action protocol (no free-text build).
  // `capabilityKeys` = curated catalog ids the user picked (tool.key);
  // `toolKeys` = the underlying BUILTIN_TOOL_NAMES, flattened + deduped. Both are
  // RE-VALIDATED server-side. An empty selection is a valid deterministic
  // "no extra tools" apply.
  const applySelection = React.useCallback(() => {
    const picked = selection.tools.filter((tool) => selected.includes(tool.key))
    const capabilityKeys = picked.map((tool) => tool.key)
    const toolKeys = Array.from(
      new Set(picked.flatMap((tool) => tool.toolKeys)),
    )

    onSubmitCard("tool_selection", {
      action: "apply",
      capabilityKeys,
      toolKeys,
    })
  }, [onSubmitCard, selected, selection.tools])

  return (
    <div
      className="max-w-[95%] rounded-lg border p-4"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold" style={{ color: tokens.textPrimary }}>
            Escolher ferramentas
          </p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            {selection.reason ??
              "Selecione o que este agente poderá fazer além de responder mensagens."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {selection.tools.map((tool) => {
          const checked = selected.includes(tool.key)
          return (
            <button
              key={tool.key}
              type="button"
              role="checkbox"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => toggleTool(tool.key)}
              className="group rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: checked ? tokens.brandSubtle : tokens.bgBase,
                borderColor: checked ? tokens.brand : tokens.divider,
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: checked ? tokens.brand : tokens.hoverBg,
                    color: checked ? tokens.textInverse : tokens.textSecondary,
                  }}
                >
                  <ToolIcon icon={tool.icon} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[13px] font-medium"
                      style={{ color: tokens.textPrimary }}
                    >
                      {tool.title}
                    </span>
                    {tool.recommended && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: tokens.hoverBg,
                          color: tokens.textTertiary,
                        }}
                      >
                        recomendado
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
                    {tool.description}
                  </p>
                  <p className="mt-2 flex gap-1.5 text-[11px] leading-relaxed" style={{ color: tokens.textTertiary }}>
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{tool.note ?? toolHelpText(tool.key)}</span>
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                  style={{
                    backgroundColor: checked ? tokens.brand : "transparent",
                    borderColor: checked ? tokens.brand : tokens.divider,
                    color: checked ? tokens.textInverse : "transparent",
                  }}
                >
                  {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 text-[12px]"
          onClick={applySelection}
          disabled={disabled}
        >
          <Check className="h-3.5 w-3.5" />
          Aplicar seleção
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-[12px]"
          // "No extra tools" is a deterministic empty apply (flips the same
          // sentinel) — not a free-text turn.
          onClick={() =>
            onSubmitCard("tool_selection", {
              action: "apply",
              capabilityKeys: [],
              toolKeys: [],
            })
          }
          disabled={disabled}
        >
          Sem ferramentas agora
        </Button>
      </div>
    </div>
  )
}

interface ChannelEntry {
  key: string
  title: string
  description: string
  requiresApproval?: boolean
}

function getChannelSelection(result: unknown) {
  if (!result || typeof result !== "object") return null
  const r = result as Record<string, unknown>
  const rawChannels = Array.isArray(r.channels) ? r.channels : []
  const channels = rawChannels
    .map((item): ChannelEntry | null => {
      if (!item || typeof item !== "object") return null
      const raw = item as Record<string, unknown>
      const key = typeof raw.key === "string" ? raw.key : null
      const title = typeof raw.title === "string" ? raw.title : null
      const description =
        typeof raw.description === "string" ? raw.description : null
      if (!key || !title || !description) return null
      return {
        key,
        title,
        description,
        requiresApproval: raw.requiresApproval === true,
      }
    })
    .filter((item): item is ChannelEntry => item !== null)

  if (channels.length === 0) return null

  return {
    reason: getStringField(result, "reason"),
    channels,
  }
}

function ChannelIcon({ channel }: { channel: string }) {
  const className = "h-4 w-4"
  if (channel === "instagram") return <Instagram className={className} />
  if (channel === "uazapi") return <QrCode className={className} />
  return <MessageCircle className={className} />
}

function ChannelSelectionCard({
  selection,
  tokens,
  onSubmitCard,
  disabled = false,
}: {
  selection: NonNullable<ReturnType<typeof getChannelSelection>>
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  /** Card-action protocol submit — flips the `channel` sentinel. The server
   *  re-validates `channelKey` against the channel catalog (cloudapi | uazapi |
   *  instagram). */
  onSubmitCard: (cardKey: CardKey, payload: Record<string, unknown>) => void
  /** True while streaming — prevents queuing conflicting channel choices. */
  disabled?: boolean
}) {
  return (
    <div
      className="max-w-[95%] rounded-lg border p-4"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <MessageCircle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold" style={{ color: tokens.textPrimary }}>
            Escolher canal
          </p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            {selection.reason ?? "Escolha onde este agente vai atender os clientes."}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {selection.channels.map((channel) => (
          <button
            key={channel.key}
            type="button"
            disabled={disabled}
            className="rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              backgroundColor: tokens.bgBase,
              borderColor: tokens.divider,
            }}
            onClick={() =>
              onSubmitCard("channel", {
                action: "select",
                channelKey: channel.key,
              })
            }
          >
            <div className="flex items-start gap-3">
              <div
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                style={{
                  backgroundColor: tokens.hoverBg,
                  color: tokens.textSecondary,
                }}
              >
                <ChannelIcon channel={channel.key} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium" style={{ color: tokens.textPrimary }}>
                    {channel.title}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: tokens.hoverBg,
                      color: tokens.textTertiary,
                    }}
                  >
                    {channel.requiresApproval ? "requer aprovação" : "QR rápido"}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
                  {channel.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function getQrResult(result: unknown) {
  if (!result || typeof result !== "object") return null
  const r = result as Record<string, unknown>
  if (r.success !== true) return null
  const instanceId = getStringField(result, "instanceId")
  const qrCodeBase64 = getStringField(result, "qrCodeBase64")
  const shareLink = getStringField(result, "shareLink")
  const expiresIn =
    typeof r.expiresIn === "number" && Number.isFinite(r.expiresIn)
      ? r.expiresIn
      : null
  if (!instanceId && !qrCodeBase64 && !shareLink) return null
  return { instanceId, qrCodeBase64, shareLink, expiresIn }
}

function WhatsAppQrCard({
  data,
  tokens,
}: {
  data: NonNullable<ReturnType<typeof getQrResult>>
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  const [copied, setCopied] = React.useState(false)
  const handleCopyLink = React.useCallback(async () => {
    if (!data.shareLink) return
    try {
      await navigator.clipboard?.writeText(data.shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard indisponível — link continua visível/selecionável
    }
  }, [data.shareLink])

  const qrSrc = data.qrCodeBase64
    ? data.qrCodeBase64.startsWith("data:")
      ? data.qrCodeBase64
      : `data:image/png;base64,${data.qrCodeBase64}`
    : null

  return (
    <div
      className="max-w-[95%] rounded-lg border p-4"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <QrCode className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold" style={{ color: tokens.textPrimary }}>
            Conectar WhatsApp
          </p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            Escaneie o QR Code no celular ou envie o link de pareamento para quem tem acesso ao número.
          </p>
        </div>
      </div>

      {qrSrc && (
        <div className="mt-4 flex justify-center">
          <Image
            src={qrSrc}
            alt="QR Code para conectar WhatsApp"
            width={176}
            height={176}
            unoptimized
            className="h-44 w-44 rounded-md border bg-white p-2"
            style={{ borderColor: tokens.divider }}
          />
        </div>
      )}

      {data.shareLink && (
        <div
          className="mt-4 rounded-md border px-3 py-2 text-[12px]"
          style={{
            borderColor: tokens.divider,
            backgroundColor: tokens.bgBase,
            color: tokens.textSecondary,
          }}
        >
          <p className="truncate" title={data.shareLink}>{data.shareLink}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-7 gap-1.5 text-[11px]"
            onClick={() => void handleCopyLink()}
            aria-live="polite"
          >
            {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
            {copied ? "Copiado" : "Copiar link"}
          </Button>
        </div>
      )}

      {data.expiresIn && (
        <p className="mt-2 text-[11px]" style={{ color: tokens.textTertiary }}>
          Link expira em aproximadamente {Math.round(data.expiresIn / 60)} minutos.
        </p>
      )}
    </div>
  )
}

function ToolCallCard({
  toolName,
  args,
  result,
  tokens,
  streaming = false,
  isStreaming = false,
  onDraft,
  onSubmitCard,
}: {
  toolName: string
  args: unknown
  result?: unknown
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  /** This specific tool call is still streaming (no result yet). */
  streaming?: boolean
  /** The chat as a whole is streaming — disables interactive card actions. */
  isStreaming?: boolean
  /** Pre-fill the composer (the "Ajustar" free-form draft path). */
  onDraft: (content: string) => void
  /** Card-action protocol submit — the 3 legacy inline cards
   *  (agent_approval / tool_selection / channel) post their typed payload here
   *  so the deterministic confirmation sentinel flips (instead of posting free
   *  text, which never advanced the journey). */
  onSubmitCard: (cardKey: CardKey, payload: Record<string, unknown>) => void
}) {
  if (toolName === "propose_agent_creation" && !streaming) {
    const proposal = getAgentProposal(args, result)

    return (
      <div
        className="max-w-[95%] rounded-lg border p-4"
        style={{
          backgroundColor: tokens.bgSurface,
          borderColor: tokens.divider,
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
            style={{
              backgroundColor: tokens.brandSubtle,
              color: tokens.brand,
            }}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[13px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              {proposal.name}
            </p>
            <p
              className="mt-1 text-[13px] leading-relaxed"
              style={{ color: tokens.textSecondary }}
            >
              {proposal.description}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            {
              icon: ImageIcon,
              title: "Mídia",
              detail: "imagem, áudio, documento e vídeo",
              state: "ativo",
            },
            {
              icon: Timer,
              title: "Buffer",
              detail: "concatenação de mensagens",
              state: "ativo",
            },
            {
              icon: Keyboard,
              title: "Digitando",
              detail: "presença antes da resposta",
              state: "ativo",
            },
            {
              icon: Languages,
              title: "Idioma",
              detail: "detecção opcional",
              state: "opcional",
            },
            {
              icon: Volume2,
              title: "Áudio",
              detail: "callback com ElevenLabs",
              state: "opcional",
            },
            {
              icon: Mic,
              title: "Custos",
              detail: "leitura de mídia pode ser desligada",
              state: "controle",
            },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                className="flex min-w-0 items-start gap-2 rounded-md border px-3 py-2"
                style={{
                  borderColor: tokens.divider,
                  backgroundColor: tokens.bgBase,
                }}
              >
                <Icon
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  style={{ color: tokens.brand }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[12px] font-medium"
                      style={{ color: tokens.textPrimary }}
                    >
                      {item.title}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px]"
                      style={{
                        backgroundColor: tokens.brandSubtle,
                        color: tokens.brandText,
                      }}
                    >
                      {item.state}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 text-[11px] leading-snug"
                    style={{ color: tokens.textTertiary }}
                  >
                    {item.detail}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 text-[12px]"
            // Card-action protocol: flips the `agent_approval` sentinel so the
            // meta-agent may proceed with create_agent. (Was: free-text onSend,
            // which never advanced the deterministic journey.)
            onClick={() =>
              onSubmitCard("agent_approval", { action: "confirm" })
            }
            disabled={isStreaming}
          >
            <Check className="h-3.5 w-3.5" />
            Criar agente
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-[12px]"
            // Free-form draft path kept as-is: the user tweaks before confirming.
            onClick={() => onDraft("Quero ajustar antes: ")}
            disabled={isStreaming}
          >
            <Pencil className="h-3.5 w-3.5" />
            Ajustar
          </Button>
        </div>
      </div>
    )
  }

  if (toolName === "propose_tool_selection" && !streaming) {
    const selection = getToolSelection(result)
    if (selection) {
      return (
        <ToolSelectionCard
          selection={selection}
          tokens={tokens}
          onSubmitCard={onSubmitCard}
          disabled={isStreaming}
        />
      )
    }
  }

  if (toolName === "select_channel" && !streaming) {
    const selection = getChannelSelection(result)
    if (selection) {
      return (
        <ChannelSelectionCard
          selection={selection}
          tokens={tokens}
          onSubmitCard={onSubmitCard}
          disabled={isStreaming}
        />
      )
    }
  }

  if (toolName === "create_whatsapp_instance" && !streaming) {
    const qr = getQrResult(result)
    if (qr) {
      return <WhatsAppQrCard data={qr} tokens={tokens} />
    }
  }

  const label = toolLabel(toolName)
  const summary = result !== undefined ? toolResultSummary(result) : null
  const hasError =
    result !== null &&
    typeof result === "object" &&
    ((result as Record<string, unknown>).success === false ||
      typeof (result as Record<string, unknown>).error === "string")

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px]"
      style={{
        backgroundColor: tokens.bgSurface,
        border: `1px solid ${tokens.divider}`,
        color: tokens.textSecondary,
      }}
    >
      {streaming ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: tokens.brand }} />
      ) : hasError ? (
        <span className="h-3 w-3 shrink-0 text-[10px]">✗</span>
      ) : (
        <span className="h-3 w-3 shrink-0 text-[10px]" style={{ color: tokens.brand }}>✓</span>
      )}
      <span style={{ color: tokens.textPrimary }}>{label}</span>
      {summary && (
        <span className="ml-1 truncate" style={{ color: hasError ? tokens.dangerText : tokens.textTertiary }}>
          — {summary}
        </span>
      )}
    </div>
  )
}
