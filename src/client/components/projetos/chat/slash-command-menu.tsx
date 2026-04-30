"use client"

import * as React from "react"

import type { useAppTokens } from "@/client/hooks/use-app-tokens"

import type { SlashCommand } from "./slash-commands"

type Tokens = ReturnType<typeof useAppTokens>["tokens"]

export interface SlashCommandMenuProps {
  open: boolean
  commands: SlashCommand[]
  selectedIndex: number
  onSelect: (cmd: SlashCommand) => void
  onHover: (index: number) => void
  tokens: Tokens
  /**
   * Id compartilhado com o textarea via `aria-controls` / `aria-activedescendant`.
   * Cada item recebe `${listId}-item-${idx}`.
   */
  listId?: string
}

/**
 * SlashCommandMenu — dropdown flutuante renderizado acima do textarea do
 * chat quando o usuário está digitando um comando iniciado em `/`.
 *
 * Posicionamento: absoluto, `bottom-full` relativo ao container do input,
 * ancorado à esquerda. Navegação por teclado (↑/↓/Tab/Enter/Esc) é
 * gerenciada pelo componente pai (chat-input).
 */
export function SlashCommandMenu({
  open,
  commands,
  selectedIndex,
  onSelect,
  onHover,
  tokens,
  listId = "slash-command-menu",
}: SlashCommandMenuProps) {
  if (!open || commands.length === 0) return null

  return (
    <div
      id={listId}
      role="listbox"
      aria-label="Comandos disponíveis"
      className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border"
      style={{
        backgroundColor: tokens.bgElevated,
        borderColor: tokens.borderStrong,
        boxShadow: tokens.shadow,
      }}
    >
      <ul className="max-h-72 overflow-y-auto py-1">
        {commands.map((cmd, index) => {
          const isActive = index === selectedIndex
          return (
            <li
              key={cmd.id}
              id={`${listId}-item-${index}`}
              role="option"
              aria-selected={isActive}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(e) => {
                // preventDefault pra evitar blur no textarea antes do click
                e.preventDefault()
                onSelect(cmd)
              }}
              className="flex cursor-pointer items-start gap-3 border-l-2 px-3 py-2 transition-colors"
              style={{
                backgroundColor: isActive ? tokens.brandSubtle : "transparent",
                borderLeftColor: isActive ? tokens.brand : "transparent",
              }}
            >
              <span
                className="font-mono text-[13px] font-semibold"
                style={{ color: isActive ? tokens.brandText : tokens.textPrimary }}
              >
                {cmd.name}
              </span>
              <span
                className="flex-1 truncate text-[12px] leading-relaxed"
                style={{ color: tokens.textSecondary }}
              >
                {cmd.description}
              </span>
            </li>
          )
        })}
      </ul>
      <div
        className="flex items-center justify-between border-t px-3 py-1.5 text-[10px]"
        style={{
          borderColor: tokens.divider,
          color: tokens.textTertiary,
          backgroundColor: tokens.bgSurface,
        }}
      >
        <span>
          <kbd className="font-mono">↑↓</kbd> navegar{" "}
          <kbd className="ml-2 font-mono">Tab</kbd>/<kbd className="font-mono">Enter</kbd>{" "}
          selecionar
        </span>
        <span>
          <kbd className="font-mono">Esc</kbd> fechar
        </span>
      </div>
    </div>
  )
}
