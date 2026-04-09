'use client'

import * as React from 'react'
import { Bot, Send, Loader2, Wrench, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react'

import { Button } from '@/client/components/ui/button'
import { Textarea } from '@/client/components/ui/textarea'

import type { ChatMessage } from './types'

interface ChatPanelProps {
  projectId: string
  initialMessages: ChatMessage[]
}

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

const T = {
  bg: 'var(--color-bg-base, #000000)', surface: 'var(--color-bg-surface, #060402)',
  tp: 'var(--color-text-primary, #ffffff)', ts: 'var(--color-text-secondary, rgba(255,255,255,0.65))',
  tt: 'var(--color-text-tertiary, rgba(255,255,255,0.45))', brand: 'var(--color-brand, #FFD60A)', ink: '#0a0a0a',
  bs: 'var(--color-border-subtle, rgba(255,255,255,0.06))', bd: 'var(--color-border-default, rgba(255,255,255,0.12))',
  font: 'var(--font-dm-sans, ui-sans-serif, system-ui, sans-serif)', danger: '#ef4444',
} as const

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

export function ChatPanel({ projectId, initialMessages }: ChatPanelProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = React.useState('')
  const [isStreaming, setIsStreaming] = React.useState(false)
  const [streamingText, setStreamingText] = React.useState('')
  const [streamingToolCalls, setStreamingToolCalls] = React.useState<
    Array<{ toolName: string; args: unknown; result?: unknown }>
  >([])
  const [error, setError] = React.useState<string | null>(null)
  const [lastUserMessage, setLastUserMessage] = React.useState<string | null>(null)

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

  // SSE parser — multi-event chunks, partial events, multi-line data.
  const parseSseBuffer = React.useCallback(
    (buffer: string): { events: ServerEvent[]; rest: string } => {
      const events: ServerEvent[] = []
      const parts = buffer.split('\n\n')
      const rest = parts.pop() ?? ''
      for (const raw of parts) {
        if (!raw.trim()) continue
        const dataLines: string[] = []
        for (const line of raw.split('\n')) {
          if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
        }
        if (dataLines.length === 0) continue
        const payload = dataLines.join('\n')
        try {
          events.push(JSON.parse(payload) as ServerEvent)
        } catch (err) {
          console.error('[chat-panel] SSE parse failed', err, payload)
        }
      }
      return { events, rest }
    },
    [],
  )

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

      let accText = ''
      const toolCalls: Array<{ toolName: string; args: unknown; result?: unknown }> = []

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
          throw new Error(`Falha ao enviar mensagem (HTTP ${response.status})`)
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
            if (event.type === 'text-delta') {
              accText += event.text
              setStreamingText(accText)
            } else if (event.type === 'tool-call') {
              toolCalls.push({ toolName: event.toolName, args: event.args })
              setStreamingToolCalls([...toolCalls])
            } else if (event.type === 'tool-result') {
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
            } else if (event.type === 'finish') {
              const finalToolCalls =
                event.toolCalls && event.toolCalls.length > 0
                  ? event.toolCalls
                  : toolCalls
              const assistantMessage: ChatMessage = {
                id: createId(),
                role: 'assistant',
                content: accText,
                toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
                createdAt: new Date().toISOString(),
              }
              setMessages((prev) => [...prev, assistantMessage])
              setStreamingText('')
              setStreamingToolCalls([])
              finished = true
            } else if (event.type === 'error') {
              setError(event.message || 'Erro ao processar mensagem')
              finished = true
            }
            if (finished) break
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido ao enviar')
      } finally {
        setIsStreaming(false)
      }
    },
    [isStreaming, parseSseBuffer, projectId],
  )

  const handleSubmit = React.useCallback(() => void sendMessage(input), [input, sendMessage])

  const handleRetry = React.useCallback(() => {
    if (!lastUserMessage) return
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === 'user' && prev[i].content === lastUserMessage) {
          return prev.slice(0, i)
        }
      }
      return prev
    })
    void sendMessage(lastUserMessage)
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

  const charCount = input.length
  const isEmpty = messages.length === 0 && !isStreaming

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ backgroundColor: T.bg, color: T.tp, fontFamily: T.font }}>
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {isEmpty ? <EmptyState /> : null}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {isStreaming && (streamingText || streamingToolCalls.length > 0) ? (
            <MessageBubble
              streaming
              message={{
                id: 'streaming',
                role: 'assistant',
                content: streamingText,
                toolCalls: streamingToolCalls.length > 0 ? streamingToolCalls : undefined,
                createdAt: new Date().toISOString(),
              }}
            />
          ) : null}
          {isStreaming && !streamingText && streamingToolCalls.length === 0 ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: T.ts }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Pensando...
            </div>
          ) : null}
          {error ? (
            <div
              className="flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"
              style={{ borderColor: 'rgba(239,68,68,0.35)', backgroundColor: 'rgba(239,68,68,0.08)', color: T.danger }}
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Erro ao processar mensagem</p>
                <p className="text-xs" style={{ color: 'rgba(239,68,68,0.8)' }}>
                  {error}
                </p>
              </div>
              {lastUserMessage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleRetry}
                  className="h-7 gap-1 text-xs"
                  style={{ borderColor: 'rgba(239,68,68,0.35)', backgroundColor: 'transparent', color: T.danger }}
                >
                  <RefreshCw className="h-3 w-3" />
                  Tentar novamente
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="sticky bottom-0 border-t px-4 py-4 md:px-6" style={{ borderColor: T.bs, backgroundColor: T.bg }}>
        <div className="mx-auto max-w-3xl">
          <div
            className="flex items-end gap-2 rounded-2xl border px-3 py-2 transition-shadow focus-within:shadow-[0_0_0_3px_rgba(255,214,10,0.15)]"
            style={{ borderColor: T.bd, backgroundColor: T.surface }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Descreva o que você quer criar... (Ctrl+Enter para enviar)"
              rows={1}
              disabled={isStreaming}
              className="max-h-48 min-h-[40px] flex-1 resize-none border-0 bg-transparent p-2 text-sm shadow-none focus-visible:ring-0"
              style={{ color: T.tp, fontFamily: T.font }}
            />
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isStreaming || input.trim().length === 0}
              className="h-10 w-10 shrink-0 rounded-xl p-0 disabled:opacity-40"
              style={{ backgroundColor: T.brand, color: T.ink }}
              aria-label="Enviar mensagem"
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {charCount > 800 ? (
            <div className="mt-1.5 text-right text-[11px]" style={{ color: T.tt }}>
              {charCount} caracteres
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border" style={{ borderColor: T.bd, backgroundColor: T.surface }}>
        <Bot className="h-6 w-6" style={{ color: T.brand }} />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-base font-medium" style={{ color: T.tp }}>
          Pronto para construir
        </h3>
        <p className="text-sm" style={{ color: T.ts }}>
          Descreva o que você quer criar e pressione Enter
        </p>
      </div>
    </div>
  )
}

function MessageBubble({ message, streaming = false }: { message: ChatMessage; streaming?: boolean }) {
  if (message.role === 'system_banner') {
    return (
      <div className="mx-auto max-w-md text-center text-xs" style={{ color: T.tt }}>
        {message.content}
      </div>
    )
  }
  const isUser = message.role === 'user'
  const bubbleStyle: React.CSSProperties = isUser
    ? { backgroundColor: T.brand, color: T.ink }
    : { backgroundColor: 'transparent', borderColor: T.bs, color: T.tp }
  const bubbleClass = isUser
    ? 'max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed'
    : 'max-w-[95%] rounded-2xl rounded-bl-md border px-4 py-2.5 text-sm leading-relaxed'
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser ? (
        <div
          className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
          style={{ borderColor: T.bs, backgroundColor: T.surface }}
        >
          <Bot className="h-3.5 w-3.5" style={{ color: T.brand }} />
        </div>
      ) : null}
      <div className={bubbleClass} style={bubbleStyle}>
        {message.content ? (
          <p className="whitespace-pre-wrap break-words">
            {message.content}
            {streaming ? (
              <span className="ml-0.5 inline-block animate-pulse" style={{ color: T.brand }} aria-hidden>
                ▊
              </span>
            ) : null}
          </p>
        ) : streaming ? (
          <span className="inline-block animate-pulse" style={{ color: T.brand }} aria-hidden>
            ▊
          </span>
        ) : null}
        {message.toolCalls && message.toolCalls.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1.5">
            {message.toolCalls.map((tc, idx) => (
              <ToolCallCard key={idx} toolCall={tc} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ToolSection({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: T.tt }}>
        {label}
      </p>
      <pre
        className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded p-2 font-mono text-[11px]"
        style={{ backgroundColor: T.bg, color: T.ts, border: `1px solid ${T.bs}` }}
      >
        {prettyJson(value)}
      </pre>
    </div>
  )
}

function ToolCallCard({ toolCall }: { toolCall: { toolName: string; args: unknown; result?: unknown } }) {
  const pending = toolCall.result === undefined
  return (
    <details className="group rounded-lg border text-xs" style={{ borderColor: T.bs, backgroundColor: T.surface }}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2" style={{ color: T.ts }}>
        <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" />
        <Wrench className="h-3 w-3 shrink-0" style={{ color: T.brand }} />
        <span className="font-mono" style={{ color: T.tp }}>
          {toolCall.toolName}
        </span>
        {pending ? (
          <span className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: T.brand }}>
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            executando
          </span>
        ) : (
          <span className="ml-auto text-[10px] uppercase tracking-wide" style={{ color: T.tt }}>
            concluído
          </span>
        )}
      </summary>
      <div className="space-y-2 border-t px-3 py-2" style={{ borderColor: T.bs }}>
        <ToolSection label="args" value={toolCall.args} />
        {toolCall.result !== undefined ? <ToolSection label="result" value={toolCall.result} /> : null}
      </div>
    </details>
  )
}
