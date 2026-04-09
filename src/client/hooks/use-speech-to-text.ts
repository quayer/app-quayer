"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Tipagem mínima da Web Speech API — não é standard-TypeScript ainda.
 */
interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: {
    length: number
    item(index: number): {
      isFinal: boolean
      length: number
      item(index: number): { transcript: string }
      [index: number]: { transcript: string }
    }
    [index: number]: {
      isFinal: boolean
      length: number
      item(index: number): { transcript: string }
      [index: number]: { transcript: string }
    }
  }
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message?: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognition

/**
 * Hook de speech-to-text via Web Speech API.
 *
 * - 100% client-side, zero backend
 * - Suporta Chrome, Edge, Safari (não suporta Firefox)
 * - Locale default: pt-BR
 *
 * Uso:
 *   const { isSupported, isListening, start, stop, error } = useSpeechToText({
 *     lang: "pt-BR",
 *     onFinalTranscript: (text) => setInput((v) => v + text),
 *   })
 */
export interface UseSpeechToTextOptions {
  lang?: string
  onFinalTranscript?: (text: string) => void
  onInterimTranscript?: (text: string) => void
}

export interface UseSpeechToTextResult {
  isSupported: boolean
  isListening: boolean
  error: string | null
  start: () => void
  stop: () => void
}

export function useSpeechToText({
  lang = "pt-BR",
  onFinalTranscript,
  onInterimTranscript,
}: UseSpeechToTextOptions = {}): UseSpeechToTextResult {
  const [isSupported, setIsSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Detecta suporte + cria instância após mount
  useEffect(() => {
    if (typeof window === "undefined") return

    const SpeechRecognitionCtor =
      ((window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor })
        .SpeechRecognition ??
        (window as unknown as {
          webkitSpeechRecognition?: SpeechRecognitionConstructor
        }).webkitSpeechRecognition) as SpeechRecognitionConstructor | undefined

    if (!SpeechRecognitionCtor) {
      setIsSupported(false)
      return
    }

    setIsSupported(true)
    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = lang

    recognition.onstart = () => {
      setIsListening(true)
      setError(null)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ""
      let final = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!
        const transcript = result[0]!.transcript
        if (result.isFinal) final += transcript
        else interim += transcript
      }
      if (interim && onInterimTranscript) onInterimTranscript(interim)
      if (final && onFinalTranscript) onFinalTranscript(final)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const messages: Record<string, string> = {
        "no-speech": "Nenhum áudio detectado.",
        "audio-capture": "Microfone não encontrado.",
        "not-allowed": "Permissão de microfone negada.",
        aborted: "Gravação cancelada.",
        network: "Erro de rede na transcrição.",
      }
      setError(messages[event.error] ?? `Erro: ${event.error}`)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition

    return () => {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.onstart = null
      try {
        recognition.abort()
      } catch {}
      recognitionRef.current = null
    }
  }, [lang, onFinalTranscript, onInterimTranscript])

  const start = useCallback(() => {
    if (!recognitionRef.current || isListening) return
    try {
      recognitionRef.current.start()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar gravação")
    }
  }, [isListening])

  const stop = useCallback(() => {
    if (!recognitionRef.current) return
    try {
      recognitionRef.current.stop()
    } catch {}
  }, [])

  return { isSupported, isListening, error, start, stop }
}
