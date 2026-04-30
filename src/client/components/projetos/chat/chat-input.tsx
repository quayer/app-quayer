"use client"

import * as React from "react"

import type { useAppTokens } from "@/client/hooks/use-app-tokens"
import { MessageInput } from "@/client/components/ds/message-input"

import { SlashCommandMenu } from "./slash-command-menu"
import { filterCommands, type SlashCommand } from "./slash-commands"

type Tokens = ReturnType<typeof useAppTokens>["tokens"]

export interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  tokens: Tokens
}

const SLASH_LIST_ID = "chat-slash-commands"

export function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Continue a conversa com o Builder…",
  tokens,
}: ChatInputProps) {
  const [slashOpen, setSlashOpen] = React.useState(false)
  const [slashIndex, setSlashIndex] = React.useState(0)
  const [isFocused, setIsFocused] = React.useState(false)

  const slashQuery = React.useMemo(() => {
    if (!value.startsWith("/")) return null
    if (/\s/.test(value)) return null
    return value.slice(1).split(/\s/)[0] ?? ""
  }, [value])

  const filteredCommands = React.useMemo(
    () => (slashQuery === null ? [] : filterCommands(slashQuery)),
    [slashQuery],
  )

  React.useEffect(() => {
    setSlashOpen(isFocused && slashQuery !== null && filteredCommands.length > 0)
  }, [isFocused, slashQuery, filteredCommands.length])

  React.useEffect(() => { setSlashIndex(0) }, [filteredCommands])

  const selectCommand = React.useCallback(
    (cmd: SlashCommand) => {
      if (cmd.action === "clear-input") onChange("")
      else if (cmd.action === "show-help") onChange("Liste todos os comandos /slash disponíveis e o que fazem.")
      else onChange(cmd.expansion)
      setSlashOpen(false)
    },
    [onChange],
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!slashOpen || filteredCommands.length === 0) return
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => Math.min(filteredCommands.length - 1, i + 1)); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => Math.max(0, i - 1)); return }
      if (e.key === "Escape") { e.preventDefault(); setSlashOpen(false); return }
      if ((e.key === "Tab" || e.key === "Enter") && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        const cmd = filteredCommands[slashIndex]
        if (cmd) selectCommand(cmd)
      }
    },
    [filteredCommands, selectCommand, slashIndex, slashOpen],
  )

  const activeDescendant = slashOpen && filteredCommands.length > 0
    ? `${SLASH_LIST_ID}-item-${slashIndex}`
    : undefined

  return (
    <div className="px-5 pb-4 pt-2 sm:px-8 md:px-10">
      <MessageInput
        value={value}
        onChange={onChange}
        onSend={onSend}
        disabled={disabled}
        placeholder={placeholder}
        minLength={1}
        rows={2}
        tokens={tokens}
        onKeyDown={handleKeyDown}
        textareaProps={{
          role: "combobox",
          "aria-expanded": slashOpen,
          "aria-controls": slashOpen ? SLASH_LIST_ID : undefined,
          "aria-activedescendant": activeDescendant,
          "aria-autocomplete": "list",
          onFocus: () => setIsFocused(true),
          onBlur: () => setIsFocused(false),
        }}
        aboveActionBar={
          <SlashCommandMenu
            open={slashOpen}
            commands={filteredCommands}
            selectedIndex={slashIndex}
            onSelect={selectCommand}
            onHover={setSlashIndex}
            tokens={tokens}
            listId={SLASH_LIST_ID}
          />
        }
        leftSlot={
          <span className="px-2 text-[11px]" style={{ color: tokens.textTertiary }}>
            <kbd
              className="rounded px-1.5 py-0.5 font-mono text-[10px]"
              style={{ backgroundColor: tokens.hoverBg, color: tokens.textSecondary }}
            >
              ⌘
            </kbd>
            {" "}+{" "}
            <kbd
              className="rounded px-1.5 py-0.5 font-mono text-[10px]"
              style={{ backgroundColor: tokens.hoverBg, color: tokens.textSecondary }}
            >
              Enter
            </kbd>
            {" "}para enviar
          </span>
        }
      />
    </div>
  )
}
