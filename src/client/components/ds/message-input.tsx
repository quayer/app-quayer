"use client"

import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { ArrowUp, Loader2, Mic, Square } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { useSpeechToText } from "@/client/hooks/use-speech-to-text"

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
const REC_RED_BG = "rgba(239,68,68,0.18)"
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
    start: startRecording,
    stop: stopRecording,
  } = useSpeechToText({
    lang: voiceLang,
    onInterimTranscript: handleTranscript,
    onFinalTranscript: handleTranscript,
  })

  const voiceActive = voiceEnabled && speechSupported
  const showMic = voiceActive && !canSend && !isListening
  const showStop = voiceActive && isListening

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

  const handleRightButton = () => {
    if (disabled) return
    if (showStop) { stopRecording(); return }
    if (showMic) {
      baseValueRef.current = value
      // start() is async-ish (does getUserMedia + permission popup).
      // Errors set hook.error which we surface below the input.
      startRecording()
      return
    }
    if (canSend) onSend()
  }

  const buttonStyle = showStop
    ? { backgroundColor: REC_RED_BG, color: REC_RED_FG }
    : { backgroundColor: tokens.brand, color: tokens.textInverse }

  const buttonAriaLabel = disabled
    ? "Enviando"
    : showStop
      ? "Parar gravação"
      : showMic
        ? "Gravar por áudio"
        : "Enviar mensagem"

  const buttonDisabled = disabled || (!canSend && !showMic && !showStop)

  const {
    onKeyDown: _ok, onChange: _oc,
    style: extraStyle, className: extraClassName,
    ...restTextareaProps
  } = textareaProps ?? {}
  void _ok; void _oc

  return (
    <div
      className="flex flex-col rounded-2xl border transition-colors"
      style={{
        backgroundColor: tokens.bgElevated,
        borderColor: borderColor ?? tokens.border,
        boxShadow: "0 8px 32px -16px rgba(0,0,0,0.5)",
      }}
    >
      {aboveTextarea}

      <div className="px-4 pt-3">
        <textarea
          {...restTextareaProps}
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          maxLength={maxLength}
          className={`w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:opacity-60 disabled:cursor-not-allowed disabled:opacity-60 ${extraClassName ?? ""}`}
          style={{
            color: tokens.textPrimary,
            ...extraStyle,
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-3">
        <div className="flex min-w-0 items-center">{leftSlot}</div>

        <button
          type="button"
          onClick={handleRightButton}
          disabled={buttonDisabled}
          aria-label={buttonAriaLabel}
          aria-pressed={showStop ? true : undefined}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={buttonStyle}
        >
          {disabled ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : showStop ? (
            <Square className="h-3.5 w-3.5 animate-pulse" fill="currentColor" aria-hidden />
          ) : showMic ? (
            <Mic className="h-4 w-4" aria-hidden />
          ) : (
            <ArrowUp className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>

      {speechError && (
        <div
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
