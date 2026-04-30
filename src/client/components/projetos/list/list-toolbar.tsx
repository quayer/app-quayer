"use client"

import { useRouter } from "next/navigation"
import { Plus, Search, SlidersHorizontal } from "lucide-react"
import { Input } from "@/client/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { FILTERS, type FilterKey } from "./list-types"

interface ListToolbarProps {
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  query: string
  onQueryChange: (value: string) => void
  filter: FilterKey
  onFilterChange: (value: FilterKey) => void
}

export function ListToolbar({
  tokens,
  query,
  onQueryChange,
  filter,
  onFilterChange,
}: ListToolbarProps) {
  const router = useRouter()
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative min-w-0 flex-1 md:max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: tokens.textTertiary }}
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar por nome…"
          className="h-10 border-0 pl-9 text-[14px]"
          style={{
            backgroundColor: tokens.bgSurface,
            borderColor: tokens.border,
            color: tokens.textPrimary,
            border: `1px solid ${tokens.border}`,
          }}
          aria-label="Buscar projetos"
        />
      </div>

      {/* Filter dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-10 items-center gap-2 rounded-md border px-3.5 text-[13px] font-medium transition-colors"
            style={{
              backgroundColor: tokens.bgSurface,
              borderColor: tokens.border,
              color: tokens.textPrimary,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = tokens.hoverBg
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = tokens.bgSurface
            }}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {FILTERS.find((f) => f.key === filter)?.label ?? "Filtro"}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {FILTERS.map((f) => (
            <DropdownMenuItem key={f.key} onClick={() => onFilterChange(f.key)}>
              {f.label}
              {filter === f.key && (
                <span
                  className="ml-auto h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: tokens.brand }}
                />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* CTA Novo projeto */}
      <button
        type="button"
        onClick={() => router.push("/")}
        className="flex h-10 items-center gap-2 rounded-md px-4 text-[13px] font-semibold transition-opacity hover:opacity-90"
        style={{
          backgroundColor: tokens.brand,
          color: tokens.textInverse,
        }}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        Novo projeto
      </button>
    </div>
  )
}
