'use client'

import * as React from 'react'
import { Loader2, Send, AlertCircle, RotateCcw } from 'lucide-react'

import { Button } from '@/client/components/ui/button'
import { Textarea } from '@/client/components/ui/textarea'
import { cn } from '@/lib/utils'

import type { ChatMessage } from './types'

// ============================================================
// Props
// ============================================================

interface ChatPanelProps {
  projectId: string
  initialMessages: ChatMessage[]
}

// ============================================================
// SSE event shape (matches server builder.controller.ts)
// ============================================================

type ServerEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolName: string; args: Record<string, unknown> }
  | { type: 'tool-result'; toolName: string; result: unknown }
  | {
      type: 'finish'
      toolCalls?: Array<{
        toolName: string
        args: Record<string, unknown>
        result: unknown
      }>
    }
  | { type: 'error'; message: string }

// ============================================================
// Helpers
// ============================================================

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

// ============================================================
// Component
// ============================================================

export function ChatPanel({ projectId, initialMessages }: ChatPanelProps) {
  const [messages, setMessages] =
    React.useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = React.useState('')
  const [isStreaming, setIsStreaming] = React.useState(false)
  const [streamingText, setStreamingText] = React.useState('')
  const [streamingToolCalls, setStreamingToolCalls] = React.useState<
    Array<{ toolName: string; args: unknown; result?: unknown }>
  >([])
  const [error, setError] = React.useState<string | null>(null)
  const [lastUserMessage, setLastUserMessage] = React.useState<string | null>(
    null,
  )

  // ------------------------------------------------------------------
  // Auto-scroll management (pause if user scrolled up)
  // ------------------------------------------------------------------
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const autoScrollRef = React.useRef(true)

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom =
      el.scrollHeight - (el.scrollTop + el.clientHeight)
    autoScrollRef.current = distanceFromBottom < 100
  }, [])

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  React.useEffect(() => {
    if (autoScrollRef.current) {
      scrollToBottom()
    }
  }, [messages, streamingText, streamingToolCalls, scrollToBottom])

  // Initial scroll on mount
  React.useEffect(() => {
    scrollToBottom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------------------------------------------------------------------
  // SSE parser
  //
  // Edge cases handled:
  //  - Multi-event chunks (split on \n\n)
  //  - Partial events across chunks (keep tail in buffer)
  //  - Multi-line `data:` fields (join with \n per SSE spec)
  //  - Ignore non-data lines (comments, retry:, etc.)
  // ------------------------------------------------------------------
  const parseSseBuffer = React.useCallback(
    (buffer: string): { events: ServerEvent[]; rest: string } => {
      const events: ServerEvent[] = []
      const parts = buffer.split('\n\n')
      // Last item may be incomplete — keep as remainder.
      const rest = parts.pop() ?? ''

      for (const raw of parts) {
        if (!raw.trim()) continue
        const dataLines: string[] = []
        for (const line of raw.split('\n')) {
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart())
          }
        }
        if (dataLines.length === 0) continue
        const payload = dataLines.join('\n')
        try {
          events.push(JSON.parse(payload) as ServerEvent)
        } catch (err) {
          console.error('[chat-panel] failed to parse SSE payload', err, payload)
        }
      }

      return { events, rest }
    },
    [],
  )

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------
  const sendMessage = React.useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || isStreaming) return

      setError(null)
      setLastUserMessage(trimmed)
      autoScrollRef.current = true

      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMessage])
      setInput('')
      setIsStreaming(true)
      setStreamingText('')
      setStreamingToolCalls([])

      // Local accumulators (state updates are async).
      let accText = ''
      const toolCalls: Array<{
        toolName: string
        args: unknown
        result?: unknown
      }> = []

      try {
        const response = await fetch(
          `/api/v1/builder/projects/${projectId}/chat/message`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: trimmed }),
          },
        )

        if (!response.ok || !response.body) {
          throw new Error(
            `Falha ao enviar mensagem (HTTP ${response.status})`,
          )
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let finished = false

        while (!finished) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const { events, rest } = parseSseBuffer(buffer)
          buffer = rest

          for (const event of events) {
            switch (event.type) {
              case 'text-delta': {
                accText += event.text
                setStreamingText(accText)
                break
              }
              case 'tool-call': {
                toolCalls.push({
                  toolName: event.toolName,
                  args: event.args,
                })
                setStreamingToolCalls([...toolCalls])
                break
              }
              case 'tool-result': {
                // Match the latest pending call with the same toolName.
                for (let i = toolCalls.length - 1; i >= 0; i--) {
                  if (
                    toolCalls[i].toolName === event.toolName &&
                    toolCalls[i].result === undefined
                  ) {
                    toolCalls[i] = { ...toolCalls[i], result: event.result }
                    break
                  }
                }
                setStreamingToolCalls([...toolCalls])
                break
              }
              case 'finish': {
                const finalToolCalls =
                  event.toolCalls && event.toolCalls.length > 0
                    ? event.toolCalls
                    : toolCalls
                const assistantMessage: ChatMessage = {
                  id: createId(),
                  role: 'assistant',
                  content: accText,
                  toolCalls:
                    finalToolCalls.length > 0 ? finalToolCalls : undefined,
                  createdAt: new Date().toISOString(),
                }
                setMessages((prev) => [...prev, assistantMessage])
                setStreamingText('')
                setStreamingToolCalls([])
                finished = true
                break
              }
              case 'error': {
                setError(event.message || 'Erro ao processar mensagem')
                finished = true
                break
              }
            }
            if (finished) break
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro desconhecido ao enviar'
        setError(message)
      } finally {
        setIsStreaming(false)
      }
    },
    [isStreaming, parseSseBuffer, projectId],
  )

  const handleSubmit = React.useCallback(() => {
    void sendMessage(input)
  }, [input, sendMessage])

  const handleRetry = React.useCallback(() => {
    if (lastUserMessage) {
      // Drop the trailing failed user message so we don't duplicate it.
      setMessages((prev) => {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === 'user' && prev[i].content === lastUserMessage) {
            return prev.slice(0, i)
          }
        }
        return prev
      })
      void sendMessage(lastUserMessage)
    }
  }, [lastUserMessage, sendMessage])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  // ==================================================================
  // Render
  // ==================================================================
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ---------- Messages scrollable region ---------- */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-4 md:px-5"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.length === 0 && !isStreaming ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Comece descrevendo o agente que você quer criar.
            </div>
          ) : null}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {/* Streaming partial assistant message */}
          {isStreaming && (streamingText || streamingToolCalls.length > 0) ? (
            <MessageBubble
              streaming
              message={{
                id: 'streaming',
                role: 'assistant',
                content: streamingText,
                toolCalls:
                  streamingToolCalls.length > 0
                    ? streamingToolCalls
                    : undefined,
                createdAt: new Date().toISOString(),
              }}
            />
          ) : null}

          {/* Thinking dots while nothing streamed yet */}
          {isStreaming && !streamingText && streamingToolCalls.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Pensando...
            </div>
          ) : null}

          {/* Error banner */}
          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Erro</p>
                <p className="text-xs opacity-90">{error}</p>
              </div>
              {lastUserMessage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleRetry}
                  className="h-7 gap-1 text-xs"
                >
                  <RotateCcw className="h-3 w-3" />
                  Tentar novamente
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* ---------- Input footer ---------- */}
      <div className="border-t border-border/60 bg-background/80 px-3 py-3 md:px-5">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Descreva seu agente... (Ctrl+Enter para enviar)"
            rows={2}
            disabled={isStreaming}
            className="max-h-40 min-h-[44px] flex-1 resize-none"
          />
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isStreaming || input.trim().length === 0}
            className="h-10 shrink-0 gap-1.5"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Sub-component: single message bubble
// ============================================================

function MessageBubble({
  message,
  streaming = false,
}: {
  message: ChatMessage
  streaming?: boolean
}) {
  if (message.role === 'system_banner') {
    return (
      <div className="mx-auto max-w-md text-center text-xs text-muted-foreground">
        {message.content}
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed md:max-w-[75%]',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        {message.content ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : null}

        {message.toolCalls && message.toolCalls.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1.5">
            {message.toolCalls.map((tc, idx) => (
              <details
                key={idx}
                className="rounded-md border border-border/60 bg-background/60 text-xs text-foreground"
              >
                <summary className="cursor-pointer list-none px-2 py-1.5 font-mono font-medium text-muted-foreground hover:text-foreground">
                  <span className="text-primary">⚙</span> {tc.toolName}
                  {tc.result === undefined ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-500">
                      executando...
                    </span>
                  ) : null}
                </summary>
                <div className="space-y-2 border-t border-border/60 px-2 py-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      args
                    </p>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-2 font-mono text-[11px]">
                      {prettyJson(tc.args)}
                    </pre>
                  </div>
                  {tc.result !== undefined ? (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        result
                      </p>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-2 font-mono text-[11px]">
                        {prettyJson(tc.result)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        ) : null}

        {streaming ? (
          <span
            className="ml-1 inline-block h-3 w-1 translate-y-0.5 animate-pulse bg-current"
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  )
}
