"use client"

/**
 * usePlaygroundStream — estado do chat de teste stateless do Playground.
 *
 * Extraído do PlaygroundTab (FILE_SIZE_GUIDELINES): possui as mensagens locais
 * (nunca persistem no banco), o consumo do SSE de `/playground/stream` (parser
 * local em `parse-sse-buffer.ts`), o AbortController que cancela o stream no
 * unmount (troca de tab) e a tradução dos erros do stream para PT-BR.
 */

import * as React from "react"

import { parseSseBuffer } from "./parse-sse-buffer"
import { translatePlaygroundError } from "./translate-playground-error"

export interface PlaygroundToolCall {
  toolName: string
  args: unknown
  result?: unknown
}

export interface PlaygroundMessage {
  id: string
  role: "user" | "assistant"
  content: string
  toolCalls?: PlaygroundToolCall[]
}

const MAX_HISTORY = 20

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `pg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function usePlaygroundStream(
  projectId: string,
  aiAgentId: string | null,
) {
  const [messages, setMessages] = React.useState<PlaygroundMessage[]>([])
  const [input, setInput] = React.useState("")
  const [isStreaming, setIsStreaming] = React.useState(false)
  const [streamingText, setStreamingText] = React.useState("")
  const [streamingToolCalls, setStreamingToolCalls] = React.useState<
    PlaygroundToolCall[]
  >([])
  const [error, setError] = React.useState<string | null>(null)

  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  // Cancela o stream em andamento quando a tab desmonta (troca de aba):
  // sem isto o reader continuaria drenando o body e chamando setState em
  // componente morto até o servidor fechar a conexão.
  React.useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const clearConversation = React.useCallback(() => {
    setMessages([])
    setStreamingText("")
    setStreamingToolCalls([])
    setError(null)
    inputRef.current?.focus()
  }, [])

  const sendMessage = React.useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || isStreaming || !aiAgentId) return

      setError(null)
      setInput("")
      setIsStreaming(true)
      setStreamingText("")
      setStreamingToolCalls([])

      const userMsg: PlaygroundMessage = {
        id: createId(),
        role: "user",
        content: trimmed,
      }
      setMessages((prev) => [...prev, userMsg])

      // Histórico para a request: últimas MAX_HISTORY mensagens COM conteúdo.
      // Mensagens vazias derrubam o turno seguinte (a Anthropic rejeita
      // assistant content vazio com 400), então são filtradas na origem.
      // A mensagem do turno atual vai separada no campo `message`.
      const history = messages
        .filter((m) => m.content.trim().length > 0)
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, content: m.content }))

      let accText = ""
      const toolCallsAcc: PlaygroundToolCall[] = []
      let finished = false

      const controller = new AbortController()
      abortRef.current = controller

      // Só registra a bolha assistant quando houve conteúdo de verdade —
      // evento `error` sem texto NÃO cria bolha vazia (que contaminaria o
      // histórico dos próximos sends).
      const flushAssistant = () => {
        if (!accText && toolCallsAcc.length === 0) return
        const assistantMsg: PlaygroundMessage = {
          id: createId(),
          role: "assistant",
          content: accText,
          toolCalls: toolCallsAcc.length > 0 ? [...toolCallsAcc] : undefined,
        }
        setMessages((prev) => [...prev, assistantMsg])
      }

      try {
        const res = await fetch(
          `/api/v1/builder/projects/${projectId}/playground/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: trimmed, history }),
            signal: controller.signal,
          },
        )

        if (!res.ok || !res.body) {
          setError(`Falha na requisição (HTTP ${res.status})`)
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (!finished) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const { events, rest } = parseSseBuffer(buffer)
          buffer = rest

          for (const ev of events) {
            if (ev.type === "text-delta") {
              accText += ev.text
              setStreamingText(accText)
            } else if (ev.type === "tool-call") {
              toolCallsAcc.push({ toolName: ev.toolName, args: ev.args })
              setStreamingToolCalls([...toolCallsAcc])
            } else if (ev.type === "tool-result") {
              // Casa o resultado com a última chamada da MESMA tool ainda
              // pendente — encerra o spinner daquela tool individualmente em
              // vez de deixar todas "executando" até o fim do stream.
              for (let i = toolCallsAcc.length - 1; i >= 0; i--) {
                if (
                  toolCallsAcc[i]!.toolName === ev.toolName &&
                  toolCallsAcc[i]!.result === undefined
                ) {
                  toolCallsAcc[i] = { ...toolCallsAcc[i]!, result: ev.result ?? null }
                  break
                }
              }
              setStreamingToolCalls([...toolCallsAcc])
            } else if (ev.type === "finish") {
              if (ev.toolCalls && ev.toolCalls.length > 0) {
                // O finish agrega args+result autoritativos por tool.
                toolCallsAcc.length = 0
                toolCallsAcc.push(...ev.toolCalls)
              }
              flushAssistant()
              setStreamingText("")
              setStreamingToolCalls([])
              finished = true
            } else if (ev.type === "error") {
              setError(translatePlaygroundError(ev.message))
              flushAssistant()
              setStreamingText("")
              setStreamingToolCalls([])
              finished = true
            }
            if (finished) break
          }
        }

        // Stream caiu sem finish/error (queda de rede, servidor reiniciou):
        // preserva o texto parcial como mensagem em vez de descartá-lo.
        if (!finished) {
          const hadPartial = accText.length > 0 || toolCallsAcc.length > 0
          flushAssistant()
          setStreamingText("")
          setStreamingToolCalls([])
          setError(
            hadPartial
              ? "A conexão foi interrompida antes da resposta terminar. A resposta parcial foi mantida."
              : translatePlaygroundError(null),
          )
        }
      } catch (err) {
        // Abort no unmount/troca de tab: silencioso, o componente já morreu.
        if (controller.signal.aborted) return
        setError(
          translatePlaygroundError(
            err instanceof Error ? err.message : String(err),
          ),
        )
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (!controller.signal.aborted) {
          setIsStreaming(false)
          inputRef.current?.focus()
        }
      }
    },
    [aiAgentId, isStreaming, messages, projectId],
  )

  return {
    messages,
    input,
    setInput,
    isStreaming,
    streamingText,
    streamingToolCalls,
    error,
    inputRef,
    sendMessage,
    clearConversation,
  }
}
