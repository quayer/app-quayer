"use client"

import { Filter } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { FILTERS, type FilterKey } from "./list-types"

interface EmptyStateProps {
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  query: string
  filter: FilterKey
}

export function EmptyState({ tokens, query, filter }: EmptyStateProps) {
  const isSearching = query.trim() !== ""
  const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? ""
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-xl border py-16 text-center"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
      }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: tokens.brandSubtle,
          color: tokens.brand,
        }}
      >
        <Filter className="h-6 w-6" />
      </div>
      <div>
        <h3
          className="text-base font-semibold"
          style={{ color: tokens.textPrimary }}
        >
          {isSearching
            ? "Nada encontrado"
            : filter === "todos"
              ? "Nenhum projeto ainda"
              : `Nenhum projeto em ${filterLabel.toLowerCase()}`}
        </h3>
        <p
          className="mx-auto mt-1 max-w-sm text-[13px]"
          style={{ color: tokens.textSecondary }}
        >
          {isSearching
            ? "Tente ajustar a busca ou o filtro."
            : "Descreva o que quer criar lá na home e o Builder cria o primeiro agente em segundos."}
        </p>
      </div>
    </div>
  )
}
