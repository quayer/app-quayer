'use client'

import { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface FilterBarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  filters?: ReactNode
  onClearFilters?: () => void
  showClearButton?: boolean
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  filters,
  onClearFilters,
  showClearButton = true,
}: FilterBarProps) {
  const hasActiveFilters = searchValue.length > 0

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      {filters}
      {showClearButton && hasActiveFilters && onClearFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-10"
        >
          <X className="h-4 w-4 mr-2" />
          Limpar filtros
        </Button>
      )}
    </div>
  )
}
