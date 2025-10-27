'use client'

import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface BulkActionBarProps {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onClearSelection: () => void
  actions: Array<{
    label: string
    icon?: React.ReactNode
    variant?: 'default' | 'destructive' | 'outline' | 'secondary'
    onClick: () => void
  }>
}

export function BulkActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  actions,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">{selectedCount} selecionado(s)</span>
          {selectedCount < totalCount && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onSelectAll}
              className="h-7"
            >
              Selecionar todos ({totalCount})
            </Button>
          )}
        </div>

        <div className="h-6 w-px bg-primary-foreground/30" />

        <div className="flex items-center gap-2">
          {actions.map((action, index) => (
            <Button
              key={index}
              size="sm"
              variant={action.variant || 'secondary'}
              onClick={action.onClick}
              className="h-7"
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={onClearSelection}
          className="h-7 w-7 p-0 hover:bg-primary-foreground/10"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
