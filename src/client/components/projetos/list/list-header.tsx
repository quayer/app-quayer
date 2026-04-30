"use client"

import { useAppTokens } from "@/client/hooks/use-app-tokens"

interface ListHeaderProps {
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}

export function ListHeader({ tokens }: ListHeaderProps) {
  return (
    <header className="mb-8">
      <p
        className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: tokens.brand }}
      >
        Workspace
      </p>
      <h1
        className="text-[2.5rem] font-bold leading-[1.05] tracking-tight sm:text-[3rem]"
        style={{
          fontFamily:
            "var(--font-display), Georgia, 'Times New Roman', serif",
          color: tokens.textPrimary,
        }}
      >
        Meus projetos
      </h1>
      <p
        className="mt-2 text-[15px]"
        style={{ color: tokens.textSecondary }}
      >
        Cada projeto é uma conversa que você teve com o Builder pra criar um
        agente de WhatsApp.
      </p>
    </header>
  )
}
