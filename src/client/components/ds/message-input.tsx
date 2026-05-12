"use client"

import { useCallback, useEffect, useLayoutEffect } from "react"
import { ArrowUp, Loader2 } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

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
}

const MAX_HEIGHT_PX = 200

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
}: MessageInputProps) {
  const canSend = !disabled && value.trim().length >= minLength

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

  const {
    onKeyDown: _omitKeyDown,
    onChange: _omitChange,
    style: extraStyle,
    className: extraClassName,
    ...restTextareaProps
  } = textareaProps ?? {}
  void _omitKeyDown
  void _omitChange

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
          onClick={onSend}
          disabled={!canSend}
          aria-label="Enviar mensagem"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            backgroundColor: tokens.brand,
            color: tokens.textInverse,
          }}
        >
          {disabled ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ArrowUp className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  )
}
