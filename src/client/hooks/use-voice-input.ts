"use client"

import { useCallback, useEffect, useRef } from "react"
import { useSpeechToText } from "./use-speech-to-text"

export interface UseVoiceInputOptions {
  /** Current value of the text field — snapshot at recording start */
  value: string
  /** Called with the updated full text during interim + final transcription */
  onChange: (value: string) => void
  /** Called after "Encerrar" once final transcription is ready */
  onSend?: () => void
  lang?: string
}

export interface UseVoiceInputResult {
  isSupported: boolean
  isListening: boolean
  isTranscribing: boolean
  error: string | null
  /** Start recording (snapshot current value as base) */
  startRecording: () => void
  /** Stop recording — transcription runs, then onSend fires if pending */
  encerrar: () => void
  /** Stop recording + restore original value (no send) */
  cancelar: () => void
}

export function useVoiceInput({
  value,
  onChange,
  onSend,
  lang = "pt-BR",
}: UseVoiceInputOptions): UseVoiceInputResult {
  const baseValueRef = useRef("")
  const autoSubmitRef = useRef(false)
  const wasTranscribing = useRef(false)

  const append = useCallback(
    (text: string) => {
      const base = baseValueRef.current
      onChange(base ? `${base} ${text}`.trim() : text.trim())
    },
    [onChange],
  )

  const {
    isSupported,
    isListening,
    isTranscribing,
    error,
    start,
    stop,
  } = useSpeechToText({ lang, onFinalTranscript: append, onInterimTranscript: append })

  const startRecording = useCallback(() => {
    baseValueRef.current = value
    start()
  }, [value, start])

  const encerrar = useCallback(() => {
    autoSubmitRef.current = true
    stop()
  }, [stop])

  const cancelar = useCallback(() => {
    autoSubmitRef.current = false
    stop()
    onChange(baseValueRef.current)
  }, [stop, onChange])

  // Auto-send after transcription completes when "Encerrar" was clicked
  const onSendRef = useRef(onSend)
  useEffect(() => { onSendRef.current = onSend }, [onSend])

  useEffect(() => {
    if (wasTranscribing.current && !isTranscribing && autoSubmitRef.current) {
      autoSubmitRef.current = false
      onSendRef.current?.()
    }
    wasTranscribing.current = isTranscribing
  }, [isTranscribing])

  return { isSupported, isListening, isTranscribing, error, startRecording, encerrar, cancelar }
}
