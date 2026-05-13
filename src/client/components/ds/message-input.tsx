"use client"

import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { ArrowUp, Loader2, Mic } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { useSpeechToText } from "@/client/hooks/use-speech-to-text"
import { AudioWaveform } from "@/client/components/ds/audio-waveform"

export interface MessageInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  minLength?: number
  maxLength?: number
  rows?: number
  sendOnEnter?: boolean
  tokens: AppTokens
  borderColor?: string
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
  textareaProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>
  leftSlot?: React.ReactNode
  aboveTextarea?: React.ReactNode
  voiceEnabled?: boolean
  voiceLang?: string
}

const MAX_HEIGHT_PX = 200
const REC_RED_FG = "#ef4444"

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

export function MessageInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder,
  minLength = 1,
  maxLength,
  rows = 3,
  sendOnEnter = true,
  tokens,
  borderColor,
  textareaRef,
  textareaProps,
  leftSlot,
  aboveTextarea,
  voiceEnabled = false,
  voiceLang = "pt-BR",
}: MessageInputProps) {
  const canSend = !disabled && value.trim().length >= minLength

  // Base value captured when recording starts, so transcript appends rather
  // than replaces what the user already typed.
  const baseValueRef = useRef("")
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const handleTranscript = useCallback((text: string) => {
    const base = baseValueRef.current
    const next = base ? `${base} ${text}`.trim() : text.trim()
    onChangeRef.current(next)
  }, [])

  const {
    isSupported: speechSupported,
    isListening,
    error: speechError,
    analyser,
    start: startRecording,
    stop: stopRecording,
  } = useSpeechToText({
    lang: voiceLang,
    onInterimTranscript: handleTranscript,
    onFinalTranscript: handleTranscript,
  })

  const voiceActive = voiceEnabled && speechSupported

  // Right-side button cluster state machine.
  // Mutually exclusive flags — exactly one of the "showOnly*" or "showMicPlusSend" is true.
  const showOnlyLoader = disabled
  const showOnlyStop = !disabled && voiceActive && isListening
  const showMicPlusSend = !disabled && voiceActive && canSend && !isListening
  const showOnlyMic = !disabled && voiceActive && !canSend && !isListening
  const showOnlySend = !disabled && !showOnlyStop && !showMicPlusSend && !showOnlyMic && canSend

  const resize = useCallback(() => {
    const el = textareaRef?.current
    if (!el) return
    Object.assign(el.style, { height: "auto" })
    const next = Math.min(el.scrollHeight, MAX_HEIGHT_PX)
    Object.assign(el.style, {
      height: `${next}px`,
      overflowY: el.scrollHeight > MAX_HEIGHT_PX ? "auto" : "hidden",
    })
  }, [textareaRef])

  useIsomorphicLayoutEffect(() => {
    resize()
  }, [value, resize])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (sendOnEnter && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (canSend) onSend()
    }
    textareaProps?.onKeyDown?.(e)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    textareaProps?.onChange?.(e)
  }

  const handleMicClick = () => {
    if (disabled || isListening) return
    baseValueRef.current = value
    // start() is async-ish (does getUserMedia + permission popup).
    // Errors set hook.error which we surface below the input.
    startRecording()
  }

  const handleStopClick = () => {
    if (disabled) return
    stopRecording()
  }

  const handleSendClick = () => {
    if (disabled || !canSend) return
    onSend()
  }

  useEffect(() => {
    if (!voiceActive) return
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod || e.key.toLowerCase() !== "d") return
      e.preventDefault()
      if (disabled) return
      if (isListening) stopRecording()
      else {
        baseValueRef.current = value
        startRecording()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [voiceActive, isListening, disabled, value, startRecording, stopRecording])

  const sendStyle = { backgroundColor: tokens.brand, color: tokens.textInverse }
  const micStyle = { backgroundColor: "transparent", color: tokens.brand, borderColor: tokens.border }

  const baseBtn =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--q-brand)] disabled:cursor-not-allowed disabled:opacity-40"
  const micDescribedBy = speechError ? "message-input-mic-error" : undefined

  const sendBtn = (
    <button
      type="button"
      onClick={handleSendClick}
      aria-label="Enviar mensagem"
      className={baseBtn}
      style={sendStyle}
    >
      <ArrowUp className="h-4 w-4" aria-hidden />
    </button>
  )
  const micBtn = (
    <button
      type="button"
      onClick={handleMicClick}
      aria-label="Gravar por áudio"
      aria-describedby={micDescribedBy}
      className={`${baseBtn} border`}
      style={micStyle}
    >
      <Mic className="h-4 w-4" aria-hidden />
    </button>
  )
  const stopBtn = (
    <button
      type="button"
      onClick={handleStopClick}
      aria-label="Parar gravação"
      aria-pressed={true}
      aria-describedby={micDescribedBy}
      className="flex h-9 items-center gap-2 rounded-full px-3 shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--q-brand)] disabled:cursor-not-allowed disabled:opacity-40"
      style={{ backgroundColor: tokens.brand, color: tokens.textInverse }}
    >
      <AudioWaveform analyser={analyser} bars={3} color="currentColor" />
      <Mic className="h-4 w-4" aria-hidden />
    </button>
  )
  const loaderBtn = (
    <button type="button" disabled aria-label="Enviando" className={baseBtn} style={sendStyle}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
    </button>
  )
  const idleSendBtn = (
    <button type="button" disabled aria-label="Enviar mensagem" className={baseBtn} style={sendStyle}>
      <ArrowUp className="h-4 w-4" aria-hidden />
    </button>
  )

  const {
    onKeyDown: _ok, onChange: _oc,
    style: extraStyle, className: extraClassName,
    ...restTextareaProps
  } = textareaProps ?? {}
  void _ok; void _oc

  return (
    <div
      className="flex flex-col rounded-2xl border transition-colors focus-within:ring-2 focus-within:ring-[var(--q-brand)]/30"
      style={{
        backgroundColor: tokens.bgElevated,
        borderColor: borderColor ?? tokens.border,
        boxShadow: "0 8px 32px -16px rgba(0,0,0,0.5)",
      }}
    >
      {aboveTextarea}

      <div className="px-4 pt-4 pb-1">
        <textarea
          {...restTextareaProps}
          aria-label={placeholder ?? "Mensagem"}
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? "Ouvindo..." : placeholder}
          disabled={disabled}
          rows={rows}
          maxLength={maxLength}
          className={`w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:opacity-75 focus-visible:rounded-md focus-visible:[box-shadow:0_0_0_2px_var(--q-brand)] disabled:cursor-not-allowed disabled:opacity-60 ${extraClassName ?? ""}`}
          style={{
            color: tokens.textPrimary,
            ...extraStyle,
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-3">
        <div className="flex min-w-0 items-center">{leftSlot}</div>

        <div className="flex items-center gap-2">
          {showOnlyLoader ? loaderBtn
            : showOnlyStop ? stopBtn
            : showMicPlusSend ? (<>{micBtn}{sendBtn}</>)
            : showOnlyMic ? micBtn
            : showOnlySend ? sendBtn
            : idleSendBtn}
        </div>
      </div>

      {voiceActive && !canSend && !isListening && !disabled && (
        <div
          className="hidden sm:flex items-center justify-end gap-1.5 px-4 pb-2 text-[11px] opacity-60"
          style={{ color: tokens.textTertiary }}
          aria-hidden
        >
          <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px]"
               style={{ borderColor: tokens.border }}>
            ⌘D
          </kbd>
          <span>para falar</span>
        </div>
      )}

      {isListening && (
        <span className="sr-only" role="status" aria-live="polite">
          Gravando áudio
        </span>
      )}

      {speechError && (
        <div
          id="message-input-mic-error"
          role="alert"
          className="border-t px-4 py-2 text-[12px]"
          style={{ borderColor: tokens.divider, color: REC_RED_FG }}
        >
          {speechError}
        </div>
      )}
    </div>
  )
}
