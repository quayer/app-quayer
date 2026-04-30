"use client"

import * as React from "react"
import { ArrowUp, Loader2, Mic, X } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { useVoiceInput } from "@/client/hooks/use-voice-input"

export interface MessageInputProps {
  // Core
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  /** Mínimo de caracteres para habilitar envio. Default: 1 */
  minLength?: number
  rows?: number
  tokens: AppTokens

  // Visual
  /** Override do box-shadow do container. Default: inset highlight + outer shadow. */
  boxShadow?: string
  /** Override da borderColor do container (ex: vermelho em erro). */
  borderColor?: string
  className?: string

  // Voice
  voiceLang?: string

  // Slots
  /** Conteúdo acima do textarea (ex: chip de arquivo anexado). */
  aboveTextarea?: React.ReactNode
  /** Conteúdo entre textarea e action bar (ex: slash command menu). */
  aboveActionBar?: React.ReactNode
  /**
   * Lado esquerdo da action bar quando em estado normal.
   * Ex: botão de anexar + model picker (home) ou hint ⌘+Enter (chat).
   */
  leftSlot?: React.ReactNode

  // Textarea extras
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
  /** Props adicionais para o <textarea> (aria-*, role, onFocus, onBlur…) */
  textareaProps?: Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "onChange" | "placeholder" | "rows" | "disabled"
  >
  /**
   * Quando true, Enter simples envia (Shift+Enter insere quebra de linha).
   * Quando false (default), apenas Ctrl/Cmd+Enter envia.
   */
  sendOnEnter?: boolean
  /** Handler de keyDown extra (slash commands, Ctrl+Enter, etc.) */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}

/**
 * MessageInput — componente unificado de input de mensagem.
 *
 * Usado por:
 *  - HomePage   → minLength=10, leftSlot=<AttachButton+ModelPicker>
 *  - ChatInput  → minLength=1,  leftSlot=<KbdHint>, aboveActionBar=<SlashMenu>
 *
 * Garante:
 *  - [send desliza à esquerda][mic fixo no canto]   ← posição estável
 *  - Focus ring unificado no card (sem duplo ring)
 *  - Comportamento de voz consistente (Ouvindo / Processando / Encerrar)
 */
export function MessageInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Digite uma mensagem…",
  minLength = 1,
  rows = 2,
  tokens,
  boxShadow,
  borderColor,
  className,
  voiceLang = "pt-BR",
  sendOnEnter = false,
  aboveTextarea,
  aboveActionBar,
  leftSlot,
  textareaRef,
  textareaProps,
  onKeyDown,
}: MessageInputProps) {
  const {
    isSupported: speechSupported,
    isListening,
    isTranscribing,
    error: speechError,
    startRecording,
    encerrar,
    cancelar,
  } = useVoiceInput({ value, onChange, onSend, lang: voiceLang })

  const canSend = value.trim().length >= minLength && !disabled

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    if (e.key === "Enter") {
      if (sendOnEnter && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        if (canSend) onSend()
      } else if (!sendOnEnter && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        onSend()
      }
    }
  }

  return (
    <div
      className={`relative rounded-2xl border transition-all focus-within:border-[rgba(255,214,10,0.45)] focus-within:shadow-[0_0_0_3px_rgba(255,214,10,0.15)] ${className ?? ""}`}
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: borderColor ?? tokens.borderStrong,
        boxShadow: boxShadow ?? "0 0 0 1px rgba(255,255,255,0.08) inset, 0 8px 40px -8px rgba(0,0,0,0.8)",
      }}
    >
      {/* Slot acima do textarea (ex: chip de arquivo) */}
      {aboveTextarea}

      {/* Wrapper relativo garante que placeholder e overlay ficam
          alinhados ao textarea, não ao topo do card (que pode ter
          o slot aboveTextarea acima). */}
      <div className="relative">
        {!value && !isListening && !isTranscribing && (
          <div className="pointer-events-none absolute left-0 top-0 px-5 pt-5">
            <span
              className="text-[15px] leading-relaxed opacity-40"
              style={{ color: tokens.textPrimary }}
            >
              {placeholder}
            </span>
          </div>
        )}

        {(isListening || isTranscribing) && !value && (
          <div className="pointer-events-none absolute left-0 top-0 px-5 pt-5">
            <span
              className="text-[15px] leading-relaxed"
              style={{ color: isListening ? "#60a5fa" : tokens.textTertiary }}
            >
              {isListening ? "Ouvindo…" : "Processando áudio…"}
            </span>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder=""
          rows={rows}
          disabled={disabled}
          className="w-full resize-none rounded-t-2xl bg-transparent px-5 pt-5 pb-3 text-[15px] leading-relaxed outline-none disabled:opacity-50"
          style={{ color: tokens.textPrimary }}
          {...textareaProps}
        />
      </div>

      {/* Slot entre textarea e action bar (ex: slash command menu) */}
      {aboveActionBar}

      {/* Action bar */}
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        {/* Lado esquerdo — contexto dinâmico */}
        {isListening ? (
          <span className="px-2 text-[12px]" style={{ color: tokens.textTertiary }}>
            Fale agora — clique em Encerrar quando terminar
          </span>
        ) : isTranscribing ? (
          <span className="px-2 text-[12px]" style={{ color: tokens.textTertiary }}>
            Aguarde…
          </span>
        ) : (
          leftSlot ?? <span />
        )}

        {/* Lado direito — send desliza à esquerda, mic fixo no canto */}
        <div className="flex items-center">
          {isListening ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={cancelar}
                className="flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors hover:bg-white/5"
                style={{ borderColor: tokens.border, color: tokens.textSecondary }}
                aria-label="Cancelar gravação"
              >
                <X className="h-3.5 w-3.5" />
                Cancelar
              </button>
              <button
                type="button"
                onClick={encerrar}
                className="flex h-9 items-center gap-[6px] rounded-full px-3 text-[13px] font-semibold transition-all"
                style={{ backgroundColor: "#2563eb", color: "#fff" }}
                aria-label="Encerrar gravação e enviar"
              >
                <div className="flex items-end gap-[2px]">
                  <div className="audio-bar audio-bar-1 bg-white" />
                  <div className="audio-bar audio-bar-2 bg-white" />
                  <div className="audio-bar audio-bar-3 bg-white" />
                </div>
                Encerrar
              </button>
            </div>
          ) : isTranscribing ? (
            <span
              className="flex items-center gap-1.5 px-2 text-[13px]"
              style={{ color: tokens.textTertiary }}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Processando…
            </span>
          ) : (
            <>
              {/*
                Send aparece à ESQUERDA do mic com fade + scale.
                Width (0→42) gerencia layout; opacity+scale dão a aparência
                de "materializar" na posição correta ao invés de deslizar do mic.
                Mic fica sempre fixo no canto direito.
              */}
              <div
                style={{
                  width: canSend ? 42 : 0,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  transition: "width 200ms cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!canSend}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{
                    marginRight: 6,
                    backgroundColor: tokens.brand,
                    color: tokens.textInverse,
                    boxShadow: "0 4px 12px -2px rgba(255,214,10,0.35)",
                    opacity: canSend ? 1 : 0,
                    transform: canSend ? "scale(1)" : "scale(0.8)",
                    transition: "opacity 150ms, transform 200ms cubic-bezier(0.16,1,0.3,1)",
                  }}
                  aria-label="Enviar"
                >
                  {disabled ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                  )}
                </button>
              </div>

              {/* Mic — sempre no canto direito */}
              {speechSupported && (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={disabled}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-200 disabled:opacity-50"
                  style={{ borderColor: tokens.border, color: tokens.textSecondary }}
                  aria-label="Gravar por áudio"
                  title="Use a voz (clique para falar)"
                >
                  <Mic className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Erro de voz */}
      {speechError && (
        <p className="px-5 pb-3 text-sm" style={{ color: "#ef4444" }}>
          {speechError}
        </p>
      )}
    </div>
  )
}
